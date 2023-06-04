<?php
/**
 * Audio Stories

 * @wordpress-plugin
 * Plugin Name:       Audio Stories
 * Description:       Audio synchronized with text and images
 * Requires at least: 4.5
 * Requires PHP:      7.0
 * Version:           0.0.1
 * Author:            Dan Phiffer
 * Author URI:        https://phiffer.org/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       audio-stories
 */

define('AUDIO_STORIES_VERSION', '0.0.1');
define('AUDIO_STORIES_SM2_VERSION', 'v297a-20170601');
// define('AUDIO_STORIES_IPSTACK_KEY', 'XXXXXXXXXXXXXXXXXXXXXXXXX');

add_action('init', function() {
	global $wp_version;
	if ($wp_version >= '5.8') {
		register_block_type(__DIR__);
	}
	register_post_type('audio_stories_play', array(
		'public' => false,
		'taxonomies' => ['audio_stories_id']
	));
	register_taxonomy('audio_stories_id', ['audio_stories_play'], [
		'public' => false
	]);
});

add_action('acf/init', function() {
	global $wp_version;
	if ($wp_version < '5.8') {
		acf_register_block_type([
			'name' => 'audio-story',
			'title' => 'Audio Story',
			'category' => 'media',
			'icon' => 'dashicons-media',
			'description' => 'Audio synchronized with text and images',
			'keywords' => [
				'audio', 'stories'
			],
			'render_callback' => 'audio_stories_render'
		]);
	}
});

function audio_stories_enqueue_assets() {
	$base_url = plugin_dir_url(__FILE__);
	$base_path = __DIR__;

	$sm2_version = AUDIO_STORIES_SM2_VERSION;
	$sm2_src = "{$base_url}lib/soundmanager$sm2_version/script/soundmanager2.js";
	wp_register_script('soundmanager2', $sm2_src, [], $sm2_version);

	$js_version = filemtime("$base_path/wp-audio-stories.js");
	$js_src = "{$base_url}wp-audio-stories.js";
	wp_enqueue_script('audio_stories', $js_src, ['soundmanager2'], $js_version);

	$css_src = "{$base_url}wp-audio-stories.css";
	$css_version = filemtime("$base_path/wp-audio-stories.css");
	wp_enqueue_style('audio_stories', $css_src, ['dashicons'], $css_version);
}

add_action('wp_enqueue_scripts', function() {
	audio_stories_enqueue_assets();
	wp_localize_script('audio_stories', 'audio_stories_api', array(
		'root' => esc_url_raw(rest_url() . 'audio_stories/'),
		'nonce' => wp_create_nonce('wp_rest')
	));
});

add_action('admin_enqueue_scripts', function($suffix) {
	if ($suffix == 'post.php') {
		audio_stories_enqueue_assets();
	}
});

function audio_stories_render($block) {
	$base_url = plugin_dir_url(__FILE__);
	$sm2_version = AUDIO_STORIES_SM2_VERSION;
	$swf_url = "$base_url/lib/soundmanager$sm2_version/swf/";
	$audio_file = get_field('audio_file');
	if (empty($audio_file)) {
		echo '<code>Audio story: no audio file selected.</code>';
		return;
	}
	$id = "audio-story-{$audio_file['id']}";
	?>
	<form action="/wp-json/audio_stories/play" method="post" id="<?php echo esc_attr($id); ?>" data-swf-url="<?php echo $swf_url ?>" class="audio-story">
		<input type="hidden" name="id" value="<?php echo esc_attr($id); ?>">
		<input type="hidden" name="audio_url" value="<?php echo esc_attr($audio_file['url']); ?>">
		<input type="submit" value="<?php the_field('button_label'); ?>">
		<span class="stats_toggle"></span>
		<div class="story hidden">
			<div class="story__wrapper">
				<div class="story__time"></div>
				<div class="story__close">&times;</div>
				<div class="story__content">
					<div class="story__text"><?php

					$moments = get_field('moments');
					if (! empty($moments)) {
						foreach ($moments as $moment) {
							$pause = empty($moment['pause']) ? '' : ' pause';
							echo "[{$moment['timestamp']}$pause] {$moment['message']}\r\n";
						}
					}

					?></div>
					<div class="story__sequence"></div>
				</div>
			</div>
			<div class="story__controls">
				<div class="story__wrapper">
					<div class="story__rewind">10 sec</div>
					<div class="story__play">Loading...</div>
					<div class="story__forward">10 sec</div>
				</div>
			</div>
		</div>
		<div class="stats_details"></div>
	</form>
	<script>audio_stories_init('<?php echo $id; ?>');</script>
<?php
}

add_action('rest_api_init', function() {
	register_rest_route('audio_stories', 'play', array(
		'methods' => 'POST',
		'callback' => 'audio_stories_play',
		'permission_callback' => '__return_true'
	));
	register_rest_route('audio_stories', 'track', array(
		'methods' => 'POST',
		'callback' => 'audio_stories_track',
		'permission_callback' => '__return_true'
	));
	register_rest_route('audio_stories', 'stats', array(
		'methods' => 'POST',
		'callback' => 'audio_stories_stats',
		'permission_callback' => '__return_true'
	));
});

function audio_stories_play() {

	if (empty($_POST['url'])) {
		return rest_ensure_response(array(
			'error' => "Include a 'url' param."
		));
	}

	if (empty($_POST['id'])) {
		return rest_ensure_response(array(
			'error' => "Include an 'id' param."
		));
	}

	$id = $_POST['id'];
	$url = $_POST['url'];

	$play_id = wp_insert_post(array(
		'post_type' => 'audio_stories_play',
		'post_status' => 'publish',
		'post_content' => wp_strip_all_tags($url)
	));
	wp_set_post_terms($play_id, [$id], 'audio_stories_id');

	$location = 'Unknown location';
	if (defined('AUDIO_STORIES_IPSTACK_KEY')) {
		$ip = $_SERVER['REMOTE_ADDR'];
		$ipstack_url = "http://api.ipstack.com/$ip?access_key=" . AUDIO_STORIES_IPSTACK_KEY;
		$rsp = wp_remote_get($ipstack_url);
		if (is_array($rsp) && ! is_wp_error($rsp)) {
			$ipstack = json_decode($rsp['body']);
			if (! empty($ipstack->country_code)) {
				$location = $ipstack->country_code;
			}
			if (! empty($ipstack->region_code)) {
				$location = "$ipstack->region_code, $location";
			}
			if (! empty($ipstack->city)) {
				$location = "$ipstack->city, $location";
			}
		}
	}
	update_post_meta($play_id, 'location', $location);

	if (! empty($_POST['ajax'])) {
		return rest_ensure_response(array(
			'play_id' => $play_id
		));
	} else {
		wp_redirect($url);
	}
	exit;
}

function audio_stories_track() {

	if (empty($_POST['play_id']) || ! is_numeric($_POST['play_id'])) {
		return rest_ensure_response(array(
			'error' => "Include a 'play_id' param."
		));
	}

	if (empty($_POST['seconds']) || ! is_numeric($_POST['seconds'])) {
		return rest_ensure_response(array(
			'error' => "Include 'seconds' param."
		));
	}

	$play_id = intval($_POST['play_id']);
	$seconds = intval($_POST['seconds']);

	update_post_meta($play_id, 'seconds', $seconds);
}

function audio_stories_stats() {

	if (! current_user_can('edit_posts')) {
		return rest_ensure_response(array(
			'error' => "You need to login to load listen statistics."
		));
	}

	$id = $_POST['id'];
	return rest_ensure_response(array(
		'id'    => $id,
		'stats' => audio_stories_get_stats($id)
	));
}

function audio_stories_get_stats($id) {
	global $wpdb;
	$plays = get_posts(array(
		'post_type'      => 'audio_stories_play',
		'posts_per_page' => -1,
		'tax_query'      => array(
			array(
				'taxonomy' => 'audio_stories_id',
				'field'    => 'slug',
				'terms'    => $id
			)
		)
	));
	$play_list = array();
	foreach ($plays as $play) {
		$play_list[] = $play->ID;
	}
	if (empty($play_list)) {
		return array();
	}
	$play_list = implode(', ', $play_list);
	$meta = $wpdb->get_results("
		SELECT post_id, meta_key, meta_value
		FROM $wpdb->postmeta
		WHERE (meta_key = 'seconds' OR meta_key = 'location')
		  AND post_id IN ($play_list)
	");
	$seconds = array();
	$locations = array();
	foreach ($meta as $row) {
		if ($row->meta_key == 'seconds') {
			$seconds[$row->post_id] = $row->meta_value;
		}
		if ($row->meta_key == 'location') {
			$locations[$row->post_id] = $row->meta_value;
		}
	}
	$stats = array();
	foreach ($plays as $play) {
		$sec = isset($seconds[$play->ID]) ? $seconds[$play->ID] : 0;
		$loc = isset($locations[$play->ID]) ? $locations[$play->ID] : 'Unknown location';
		$when = human_time_diff(strtotime($play->post_date_gmt), time()) . ' ago';
		$stats[] = array(
			'when' => $when,
			'location' => $loc,
			'duration' => audio_stories_duration($sec)
		);
	}
	return $stats;
}

function audio_stories_duration($seconds) {
	$mm = floor($seconds / 60);
	$ss = $seconds - ($mm * 60);
	if ($mm < 10) {
		$mm = "0$mm";
	}
	if ($ss < 10) {
		$ss = "0$ss";
	}
	return "$mm:$ss";
}
