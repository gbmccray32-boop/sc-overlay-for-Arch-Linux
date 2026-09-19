#define _GNU_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <gio/gio.h>
#include <gio/gunixfdlist.h>
#include <glib/gstdio.h>
#include <gst/app/gstappsink.h>
#include <gst/gst.h>
#include <gst/video/video.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

/*
 * ARCHVERSE_ALPHA23_NATIVE_PORTAL_PIPEWIRE
 *
 * The XDG ScreenCast portal grants one WINDOW source and returns a restricted
 * PipeWire remote. GStreamer consumes that remote directly. Only a packed BGRA
 * snapshot is written for an explicit parent request; no Chromium canvas, PNG
 * encoder, desktop screenshot utility, or unrestricted PipeWire connection is
 * involved.
 */

#define PORTAL_BUS_NAME "org.freedesktop.portal.Desktop"
#define PORTAL_OBJECT_PATH "/org/freedesktop/portal/desktop"
#define PORTAL_INTERFACE "org.freedesktop.portal.ScreenCast"
#define WINDOW_SOURCE_TYPE 2u
#define CURSOR_MODE_HIDDEN 1u
#define REQUEST_TIMEOUT_SECONDS 120u
#define FIRST_FRAME_TIMEOUT_NS (8 * GST_SECOND)
#define FRAME_TIMEOUT_NS (1100 * GST_MSECOND)
#define MAX_PIXELS 16000000u

typedef struct {
	GMainLoop *loop;
	GVariant *results;
	guint response;
	gboolean received;
	gboolean timed_out;
} PortalResponse;

typedef struct {
	gint x;
	gint y;
	gint width;
	gint height;
	gboolean requested;
} FrameCrop;

static GDBusConnection *connection;
static GDBusProxy *portal;
static gchar *session_handle;
static gchar *restore_token_path;
static gint pipewire_fd = -1;
static guint32 pipewire_node;
static GstElement *pipeline;
static GstAppSink *app_sink;
static guint64 request_counter;
static guint64 frame_sequence;

static gchar *json_escape(const gchar *input)
{
	GString *out = g_string_new(NULL);
	const guchar *cursor = (const guchar *)(input ? input : "");

	for (; *cursor; cursor++) {
		switch (*cursor) {
		case '\\': g_string_append(out, "\\\\"); break;
		case '"': g_string_append(out, "\\\""); break;
		case '\n': g_string_append(out, "\\n"); break;
		case '\r': g_string_append(out, "\\r"); break;
		case '\t': g_string_append(out, "\\t"); break;
		default:
			if (*cursor < 0x20)
				g_string_append_printf(out, "\\u%04x", *cursor);
			else
				g_string_append_c(out, (gchar)*cursor);
		}
	}
	return g_string_free(out, FALSE);
}

static void send_error(guint64 id, gboolean terminal, const gchar *message)
{
	g_autofree gchar *escaped = json_escape(message);
	g_print("{\"type\":\"error\",\"id\":%" G_GUINT64_FORMAT
		",\"terminal\":%s,\"error\":\"%s\"}\n",
		id, terminal ? "true" : "false", escaped);
	fflush(stdout);
}

static gboolean portal_timeout(gpointer data)
{
	PortalResponse *response = data;
	response->timed_out = TRUE;
	g_main_loop_quit(response->loop);
	return G_SOURCE_REMOVE;
}

static void portal_response_signal(GDBusConnection *unused_connection,
	const gchar *unused_sender, const gchar *unused_path,
	const gchar *unused_interface, const gchar *unused_signal,
	GVariant *parameters, gpointer data)
{
	(void)unused_connection;
	(void)unused_sender;
	(void)unused_path;
	(void)unused_interface;
	(void)unused_signal;
	PortalResponse *response = data;

	if (response->received)
		return;
	g_variant_get(parameters, "(u@a{sv})", &response->response, &response->results);
	response->received = TRUE;
	g_main_loop_quit(response->loop);
}

static gchar *sender_component(void)
{
	const gchar *unique = g_dbus_connection_get_unique_name(connection);
	gchar *component = g_strdup(unique && unique[0] == ':' ? unique + 1 : unique);

	for (gchar *cursor = component; cursor && *cursor; cursor++) {
		if (*cursor == '.')
			*cursor = '_';
	}
	return component;
}

static gchar *new_token(const gchar *prefix)
{
	request_counter++;
	return g_strdup_printf("archverse_%s_%ld_%" G_GUINT64_FORMAT,
		prefix, (long)getpid(), request_counter);
}

static GVariant *call_portal_request(const gchar *method, GVariant *parameters,
	const gchar *request_token, GError **error)
{
	g_autofree gchar *sender = sender_component();
	g_autofree gchar *request_path = g_strdup_printf(
		"/org/freedesktop/portal/desktop/request/%s/%s", sender, request_token);
	PortalResponse response = {0};
	response.loop = g_main_loop_new(NULL, FALSE);

	guint subscription = g_dbus_connection_signal_subscribe(connection,
		PORTAL_BUS_NAME, "org.freedesktop.portal.Request", "Response",
		request_path, NULL, G_DBUS_SIGNAL_FLAGS_NO_MATCH_RULE,
		portal_response_signal, &response, NULL);

	g_autoptr(GVariant) immediate = g_dbus_proxy_call_sync(portal, method,
		parameters, G_DBUS_CALL_FLAGS_NONE, 30000, NULL, error);
	if (!immediate) {
		g_dbus_connection_signal_unsubscribe(connection, subscription);
		g_main_loop_unref(response.loop);
		return NULL;
	}

	guint timeout_source = g_timeout_add_seconds(REQUEST_TIMEOUT_SECONDS,
		portal_timeout, &response);
	g_main_loop_run(response.loop);
	if (!response.timed_out)
		g_source_remove(timeout_source);
	g_dbus_connection_signal_unsubscribe(connection, subscription);
	g_main_loop_unref(response.loop);

	if (response.timed_out) {
		g_set_error(error, G_IO_ERROR, G_IO_ERROR_TIMED_OUT,
			"%s portal response timed out", method);
		return NULL;
	}
	if (!response.received || response.response != 0) {
		g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
			"%s denied or cancelled (response %u)", method, response.response);
		if (response.results)
			g_variant_unref(response.results);
		return NULL;
	}
	return response.results;
}

static guint portal_version(void)
{
	g_autoptr(GVariant) version = g_dbus_proxy_get_cached_property(portal, "version");
	return version ? g_variant_get_uint32(version) : 0;
}

static gchar *load_restore_token(void)
{
	gchar *contents = NULL;
	gsize length = 0;

	if (!restore_token_path ||
	    !g_file_get_contents(restore_token_path, &contents, &length, NULL))
		return NULL;
	g_strstrip(contents);
	if (!*contents) {
		g_free(contents);
		return NULL;
	}
	return contents;
}

static gboolean save_restore_token(const gchar *token, GError **error)
{
	if (!restore_token_path || !token || !*token)
		return TRUE;
	g_autofree gchar *temporary = g_strdup_printf("%s.tmp-%ld",
		restore_token_path, (long)getpid());
	gint fd = g_open(temporary, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0600);
	if (fd < 0) {
		g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(errno),
			"open restore-token temporary file: %s", g_strerror(errno));
		return FALSE;
	}
	const gchar *cursor = token;
	gsize left = strlen(token);
	while (left > 0) {
		ssize_t written = write(fd, cursor, left);
		if (written < 0 && errno == EINTR)
			continue;
		if (written <= 0) {
			gint saved = errno;
			close(fd);
			unlink(temporary);
			g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(saved),
				"write restore token: %s", g_strerror(saved));
			return FALSE;
		}
		cursor += written;
		left -= (gsize)written;
	}
	if (close(fd) != 0 || rename(temporary, restore_token_path) != 0) {
		gint saved = errno;
		unlink(temporary);
		g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(saved),
			"publish restore token: %s", g_strerror(saved));
		return FALSE;
	}
	return TRUE;
}

static gboolean create_portal_session(GError **error)
{
	g_autofree gchar *create_request = new_token("create");
	g_autofree gchar *session_token = new_token("session");
	GVariantBuilder options;
	g_variant_builder_init(&options, G_VARIANT_TYPE_VARDICT);
	g_variant_builder_add(&options, "{sv}", "handle_token",
		g_variant_new_string(create_request));
	g_variant_builder_add(&options, "{sv}", "session_handle_token",
		g_variant_new_string(session_token));
	g_autoptr(GVariant) create_results = call_portal_request("CreateSession",
		g_variant_new("(a{sv})", &options), create_request, error);
	if (!create_results)
		return FALSE;
	g_autoptr(GVariant) session = g_variant_lookup_value(create_results,
		"session_handle", G_VARIANT_TYPE_OBJECT_PATH);
	if (!session) {
		g_set_error_literal(error, G_IO_ERROR, G_IO_ERROR_INVALID_DATA,
			"CreateSession returned no session_handle");
		return FALSE;
	}
	session_handle = g_variant_dup_string(session, NULL);

	g_autofree gchar *select_request = new_token("select");
	g_autofree gchar *restore_token = load_restore_token();
	g_variant_builder_init(&options, G_VARIANT_TYPE_VARDICT);
	g_variant_builder_add(&options, "{sv}", "handle_token",
		g_variant_new_string(select_request));
	g_variant_builder_add(&options, "{sv}", "types",
		g_variant_new_uint32(WINDOW_SOURCE_TYPE));
	g_variant_builder_add(&options, "{sv}", "multiple",
		g_variant_new_boolean(FALSE));
	g_variant_builder_add(&options, "{sv}", "cursor_mode",
		g_variant_new_uint32(CURSOR_MODE_HIDDEN));
	if (portal_version() >= 4) {
		g_variant_builder_add(&options, "{sv}", "persist_mode",
			g_variant_new_uint32(2));
		if (restore_token)
			g_variant_builder_add(&options, "{sv}", "restore_token",
				g_variant_new_string(restore_token));
	}
	g_autoptr(GVariant) select_results = call_portal_request("SelectSources",
		g_variant_new("(oa{sv})", session_handle, &options),
		select_request, error);
	if (!select_results)
		return FALSE;

	g_autofree gchar *start_request = new_token("start");
	g_variant_builder_init(&options, G_VARIANT_TYPE_VARDICT);
	g_variant_builder_add(&options, "{sv}", "handle_token",
		g_variant_new_string(start_request));
	g_autoptr(GVariant) start_results = call_portal_request("Start",
		g_variant_new("(osa{sv})", session_handle, "", &options),
		start_request, error);
	if (!start_results)
		return FALSE;

	g_autoptr(GVariant) streams = g_variant_lookup_value(start_results,
		"streams", G_VARIANT_TYPE("a(ua{sv})"));
	if (!streams || g_variant_n_children(streams) < 1) {
		g_set_error_literal(error, G_IO_ERROR, G_IO_ERROR_INVALID_DATA,
			"Start returned no PipeWire stream");
		return FALSE;
	}
	gsize stream_index = g_variant_n_children(streams) - 1;
	g_autoptr(GVariant) stream = g_variant_get_child_value(streams, stream_index);
	g_autoptr(GVariant) properties = NULL;
	g_variant_get(stream, "(u@a{sv})", &pipewire_node, &properties);

	g_autoptr(GVariant) new_token_variant = g_variant_lookup_value(start_results,
		"restore_token", G_VARIANT_TYPE_STRING);
	if (new_token_variant) {
		const gchar *new_token_value = g_variant_get_string(new_token_variant, NULL);
		if (!save_restore_token(new_token_value, error))
			return FALSE;
	}
	return TRUE;
}

static gboolean open_pipewire_remote(GError **error)
{
	GVariantBuilder options;
	g_variant_builder_init(&options, G_VARIANT_TYPE_VARDICT);
	GUnixFDList *fd_list = NULL;
	g_autoptr(GVariant) result = g_dbus_proxy_call_with_unix_fd_list_sync(
		portal, "OpenPipeWireRemote",
		g_variant_new("(oa{sv})", session_handle, &options),
		G_DBUS_CALL_FLAGS_NONE, 30000, NULL, &fd_list, NULL, error);
	if (!result)
		return FALSE;
	g_autoptr(GUnixFDList) owned_fd_list = fd_list;
	gint fd_index = -1;
	g_variant_get(result, "(h)", &fd_index);
	pipewire_fd = g_unix_fd_list_get(owned_fd_list, fd_index, error);
	return pipewire_fd >= 0;
}

static gboolean start_pipeline(GError **error)
{
	g_autoptr(GError) parse_error = NULL;
	pipeline = gst_parse_launch(
		"pipewiresrc name=portal-source do-timestamp=true ! "
		"queue leaky=downstream max-size-buffers=1 ! "
		"videoconvert ! video/x-raw,format=BGRA ! "
		"appsink name=portal-sink max-buffers=1 drop=true sync=false",
		&parse_error);
	if (!pipeline) {
		g_propagate_error(error, g_steal_pointer(&parse_error));
		return FALSE;
	}
	GstElement *source = gst_bin_get_by_name(GST_BIN(pipeline), "portal-source");
	GstElement *sink = gst_bin_get_by_name(GST_BIN(pipeline), "portal-sink");
	if (!source || !sink) {
		g_clear_object(&source);
		g_clear_object(&sink);
		g_set_error_literal(error, G_IO_ERROR, G_IO_ERROR_FAILED,
			"native portal pipeline elements are unavailable");
		return FALSE;
	}
	g_autofree gchar *node = g_strdup_printf("%u", pipewire_node);
	g_object_set(source, "fd", pipewire_fd, "path", node, NULL);
	app_sink = GST_APP_SINK(sink);
	gst_object_unref(source);
	gst_object_unref(sink);
	if (gst_element_set_state(pipeline, GST_STATE_PLAYING) == GST_STATE_CHANGE_FAILURE) {
		g_set_error_literal(error, G_IO_ERROR, G_IO_ERROR_FAILED,
			"native portal PipeWire pipeline failed to start");
		return FALSE;
	}
	return TRUE;
}

static gboolean sample_dimensions(GstSample *sample, gint *width, gint *height,
	GstVideoInfo *info, GError **error)
{
	GstCaps *caps = gst_sample_get_caps(sample);
	if (!caps || !gst_video_info_from_caps(info, caps)) {
		g_set_error_literal(error, G_IO_ERROR, G_IO_ERROR_INVALID_DATA,
			"portal PipeWire frame has invalid video caps");
		return FALSE;
	}
	*width = GST_VIDEO_INFO_WIDTH(info);
	*height = GST_VIDEO_INFO_HEIGHT(info);
	if (*width < 1 || *height < 1 ||
	    (guint64)*width * (guint64)*height > MAX_PIXELS ||
	    GST_VIDEO_INFO_FORMAT(info) != GST_VIDEO_FORMAT_BGRA) {
		g_set_error(error, G_IO_ERROR, G_IO_ERROR_INVALID_DATA,
			"portal PipeWire frame rejected: %dx%d format=%s", *width, *height,
			gst_video_format_to_string(GST_VIDEO_INFO_FORMAT(info)));
		return FALSE;
	}
	return TRUE;
}

static gboolean write_all(gint fd, const guint8 *data, gsize length, GError **error)
{
	while (length > 0) {
		ssize_t written = write(fd, data, length);
		if (written < 0 && errno == EINTR)
			continue;
		if (written <= 0) {
			g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(errno),
				"write raw portal frame: %s", g_strerror(errno));
			return FALSE;
		}
		data += written;
		length -= (gsize)written;
	}
	return TRUE;
}

static gboolean write_sample(GstSample *sample, const gchar *output_directory,
	const FrameCrop *requested_crop, gchar **final_path, gint *width, gint *height,
	gint *source_width, gint *source_height, FrameCrop *applied_crop, guint64 *video_time,
	gdouble *copy_ms, gdouble *write_ms, GError **error)
{
	GstVideoInfo info;
	if (!sample_dimensions(sample, source_width, source_height, &info, error))
		return FALSE;
	*applied_crop = (FrameCrop){ .x = 0, .y = 0, .width = *source_width,
		.height = *source_height, .requested = FALSE };
	if (requested_crop && requested_crop->requested && requested_crop->x >= 0 &&
	    requested_crop->y >= 0 && requested_crop->width > 0 && requested_crop->height > 0 &&
	    requested_crop->x + requested_crop->width <= *source_width &&
	    requested_crop->y + requested_crop->height <= *source_height) {
		*applied_crop = *requested_crop;
		applied_crop->requested = TRUE;
	}
	*width = applied_crop->width;
	*height = applied_crop->height;
	GstBuffer *buffer = gst_sample_get_buffer(sample);
	GstVideoFrame frame;
	if (!buffer || !gst_video_frame_map(&frame, &info, buffer, GST_MAP_READ)) {
		g_set_error_literal(error, G_IO_ERROR, G_IO_ERROR_FAILED,
			"could not map portal PipeWire frame");
		return FALSE;
	}
	gsize row_bytes = (gsize)*width * 4;
	gsize packed_size = row_bytes * (gsize)*height;
	guint8 *packed = g_try_malloc(packed_size);
	if (!packed) {
		gst_video_frame_unmap(&frame);
		g_set_error_literal(error, G_IO_ERROR, G_IO_ERROR_NO_SPACE,
			"could not allocate bounded portal frame buffer");
		return FALSE;
	}
	gint64 copy_started = g_get_monotonic_time();
	const guint8 *plane = GST_VIDEO_FRAME_PLANE_DATA(&frame, 0);
	gint stride = GST_VIDEO_FRAME_PLANE_STRIDE(&frame, 0);
	for (gint y = 0; y < *height; y++) {
		const guint8 *source_row = plane + (gssize)(applied_crop->y + y) * stride +
			(gsize)applied_crop->x * 4;
		memcpy(packed + (gsize)y * row_bytes, source_row, row_bytes);
	}
	*copy_ms = (g_get_monotonic_time() - copy_started) / 1000.0;
	gst_video_frame_unmap(&frame);

	frame_sequence++;
	guint slot = (guint)(frame_sequence % 3);
	*final_path = g_strdup_printf("%s/frame-%u.bgra", output_directory, slot);
	g_autofree gchar *temporary = g_strdup_printf("%s/frame-%u.tmp-%ld",
		output_directory, slot, (long)getpid());
	gint64 write_started = g_get_monotonic_time();
	gint fd = g_open(temporary, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0600);
	if (fd < 0) {
		g_free(packed);
		g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(errno),
			"open raw portal frame: %s", g_strerror(errno));
		return FALSE;
	}
	gboolean wrote = write_all(fd, packed, packed_size, error);
	g_free(packed);
	if (close(fd) != 0 && wrote) {
		g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(errno),
			"close raw portal frame: %s", g_strerror(errno));
		wrote = FALSE;
	}
	if (!wrote || rename(temporary, *final_path) != 0) {
		if (wrote)
			g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(errno),
				"publish raw portal frame: %s", g_strerror(errno));
		unlink(temporary);
		return FALSE;
	}
	*write_ms = (g_get_monotonic_time() - write_started) / 1000.0;
	GstClockTime pts = GST_BUFFER_PTS(buffer);
	*video_time = GST_CLOCK_TIME_IS_VALID(pts) ? pts : frame_sequence * GST_SECOND;
	return TRUE;
}

static guint64 parse_request_id(const gchar *line)
{
	const gchar *type = strstr(line, "\"type\":\"capture\"");
	const gchar *id = strstr(line, "\"id\"");
	if (!type || !id || !(id = strchr(id, ':')))
		return 0;
	errno = 0;
	gchar *end = NULL;
	guint64 value = g_ascii_strtoull(id + 1, &end, 10);
	return errno == 0 && end != id + 1 ? value : 0;
}

static gboolean parse_json_integer(const gchar *start, const gchar *key, gint *value)
{
	g_autofree gchar *needle = g_strdup_printf("\"%s\"", key);
	const gchar *position = strstr(start, needle);
	if (!position || !(position = strchr(position, ':')))
		return FALSE;
	errno = 0;
	gchar *end = NULL;
	gint64 parsed = g_ascii_strtoll(position + 1, &end, 10);
	if (errno != 0 || end == position + 1 || parsed < 0 || parsed > G_MAXINT)
		return FALSE;
	*value = (gint)parsed;
	return TRUE;
}

static FrameCrop parse_request_crop(const gchar *line)
{
	FrameCrop crop = {0};
	const gchar *position = strstr(line, "\"crop\"");
	if (!position)
		return crop;
	crop.requested = parse_json_integer(position, "x", &crop.x) &&
		parse_json_integer(position, "y", &crop.y) &&
		parse_json_integer(position, "width", &crop.width) &&
		parse_json_integer(position, "height", &crop.height);
	return crop;
}

static void close_portal_session(void)
{
	if (pipeline) {
		gst_element_set_state(pipeline, GST_STATE_NULL);
		gst_object_unref(pipeline);
		pipeline = NULL;
		app_sink = NULL;
	}
	if (session_handle && connection)
		g_dbus_connection_call_sync(connection, PORTAL_BUS_NAME, session_handle,
			"org.freedesktop.portal.Session", "Close", NULL, NULL,
			G_DBUS_CALL_FLAGS_NONE, 2000, NULL, NULL);
	if (pipewire_fd >= 0)
		close(pipewire_fd);
	g_clear_pointer(&session_handle, g_free);
	g_clear_object(&portal);
	g_clear_object(&connection);
}

int main(int argc, char **argv)
{
	if (argc == 2 && g_str_equal(argv[1], "--self-test")) {
		gst_init(&argc, &argv);
		const gchar *required[] = {"pipewiresrc", "videoconvert", "appsink"};
		for (guint i = 0; i < G_N_ELEMENTS(required); i++) {
			GstElementFactory *factory = gst_element_factory_find(required[i]);
			if (!factory) {
				g_printerr("required GStreamer element missing: %s\n", required[i]);
				return 10;
			}
			gst_object_unref(factory);
		}
		g_print("native portal PipeWire helper self-test passed\n");
		return 0;
	}
	if (argc != 3) {
		g_printerr("usage: %s OUTPUT_DIRECTORY RESTORE_TOKEN_PATH\n", argv[0]);
		return 2;
	}
	umask(0077);
	restore_token_path = argv[2];
	gst_init(&argc, &argv);

	g_autoptr(GError) error = NULL;
	connection = g_bus_get_sync(G_BUS_TYPE_SESSION, NULL, &error);
	if (!connection) {
		send_error(0, TRUE, error->message);
		return 3;
	}
	portal = g_dbus_proxy_new_sync(connection, G_DBUS_PROXY_FLAGS_NONE, NULL,
		PORTAL_BUS_NAME, PORTAL_OBJECT_PATH, PORTAL_INTERFACE, NULL, &error);
	if (!portal || !create_portal_session(&error) ||
	    !open_pipewire_remote(&error) || !start_pipeline(&error)) {
		send_error(0, TRUE, error ? error->message : "native portal initialization failed");
		close_portal_session();
		return 4;
	}

	g_autoptr(GstSample) first = gst_app_sink_try_pull_sample(app_sink,
		FIRST_FRAME_TIMEOUT_NS);
	GstVideoInfo first_info;
	gint first_width = 0, first_height = 0;
	if (!first || !sample_dimensions(first, &first_width, &first_height,
		&first_info, &error)) {
		send_error(0, TRUE, error ? error->message :
			"native portal PipeWire stream produced no frame within 8000ms");
		close_portal_session();
		return 5;
	}
	g_print("{\"type\":\"ready\",\"transport\":\"portal-pipewire-window\","
		"\"engine\":\"native-gstreamer\",\"sourceName\":\"KDE portal window\","
		"\"node\":%u,\"width\":%d,\"height\":%d}\n",
		pipewire_node, first_width, first_height);
	fflush(stdout);
	gst_sample_unref(g_steal_pointer(&first));

	gchar *line = NULL;
	size_t line_capacity = 0;
	while (getline(&line, &line_capacity, stdin) >= 0) {
		guint64 id = parse_request_id(line);
		if (!id)
			continue;
		FrameCrop requested_crop = parse_request_crop(line);
		gint64 started = g_get_monotonic_time();
		g_autoptr(GstSample) sample = gst_app_sink_try_pull_sample(app_sink,
			FRAME_TIMEOUT_NS);
		if (!sample) {
			send_error(id, FALSE, "native portal stream produced no frame within 1100ms");
			continue;
		}
		g_autofree gchar *frame_path = NULL;
		gint width = 0, height = 0, source_width = 0, source_height = 0;
		FrameCrop applied_crop = {0};
		guint64 video_time = 0;
		gdouble copy_ms = 0, write_ms = 0;
		g_clear_error(&error);
		if (!write_sample(sample, argv[1], &requested_crop, &frame_path, &width, &height,
			&source_width, &source_height, &applied_crop, &video_time,
			&copy_ms, &write_ms, &error)) {
			send_error(id, FALSE, error ? error->message : "raw portal frame failed");
			continue;
		}
		g_autofree gchar *escaped_path = json_escape(frame_path);
		gdouble total_ms = (g_get_monotonic_time() - started) / 1000.0;
		gint64 captured_at = g_get_real_time() / 1000;
		g_print("{\"type\":\"frame\",\"id\":%" G_GUINT64_FORMAT
			",\"path\":\"%s\",\"pixelFormat\":\"BGRA\","
			"\"width\":%d,\"height\":%d,\"sourceWidth\":%d,\"sourceHeight\":%d,"
			"\"nativeCrop\":{\"x\":%d,\"y\":%d,\"width\":%d,\"height\":%d},"
			"\"sourceName\":\"KDE portal window\","
			"\"transport\":\"portal-pipewire-window\",\"sequence\":%"
			G_GUINT64_FORMAT ",\"videoTime\":%.9f,\"capturedAt\":%"
			G_GINT64_FORMAT ",\"stages\":{\"rawCopy\":%.3f,"
			"\"fileWrite\":%.3f,\"total\":%.3f}}\n",
			id, escaped_path, width, height, source_width, source_height,
			applied_crop.x, applied_crop.y, applied_crop.width, applied_crop.height,
			frame_sequence,
			(double)video_time / (double)GST_SECOND, captured_at,
			copy_ms, write_ms, total_ms);
		fflush(stdout);
	}
	free(line);
	close_portal_session();
	return 0;
}
