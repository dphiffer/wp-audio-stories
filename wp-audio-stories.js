var audio_stories_init = (function() {

	var sm2_is_setup = false;
	var sm2_is_ready = false;
	var play_when_ready = null;

	function api_call(endpoint, params, callback) {
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function() {
			var DONE = this.DONE || 4;
			if (this.readyState === DONE){
				if (typeof callback == 'function') {
					try {
						var rsp = JSON.parse(xhr.responseText);
					} catch (err) {
						console.log('Error parsing responseText');
						console.log(err);
					}
					callback(rsp);
				}
			}
		};
		xhr.open('POST', audio_stories_api.root + endpoint, true);
		xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
		xhr.setRequestHeader('X-WP-Nonce', audio_stories_api.nonce);

		var esc = encodeURIComponent;
		var data = Object.keys(params)
			.map(function(k) {
				return esc(k) + '=' + esc(params[k]);
			})
			.join('&');

		xhr.send(data);
	}

	var sounds = {};
	function play(id, url) {
		if (! sm2_is_ready) {
			play_when_ready = url;
			return;
		}
		if (! sounds[id]) {
			sounds[id] = soundManager.createSound({
				url: url,
				autoLoad: true
			});
			api_call('play', {
				id: id,
				url: url,
				ajax: 1
			}, function(rsp) {
				if (rsp && rsp.play_id) {
					sounds[id].play_id = rsp.play_id;
				}
			});
		}
		sounds[id].play();
	}

	function pause(id) {
		sounds[id].pause();
	}

	function setup(form) {
		if (sm2_is_setup) {
			return;
		}
		sm2_is_setup = true;
		soundManager.setup({
			url: form.getAttribute('data-swf-url'),
			onready: function() {
				sm2_is_ready = true;
				if (play_when_ready) {
					play(play_when_ready);
				}
			}
		});
	}

	function track_playback(id) {
		api_call('track', {
			play_id: sounds[id].play_id,
			seconds: Math.round(sounds[id].position / 1000)
		});
	}

	function setup_stats(rsp) {
		if (! rsp.stats) {
			return;
		}

		var form = document.querySelector('#audio_stories_' + rsp.id);
		var stats_toggle = form.querySelector('.stats_toggle');
		var stats_details = form.querySelector('.stats_details');

		var count = rsp.stats.length;
		stats_toggle.style.marginLeft = '10px';
		stats_toggle.innerHTML = '<a href="#audio_stories_stats">' + count + ' listens</a>';

		var html = '<table>' +
		           '<tr><th>When</th><th>Location</th><th>Duration</th></tr>';

		for (var i = 0; i < rsp.stats.length; i++) {
			let play = rsp.stats[i];
			html += '<tr>' +
			        '<td>' + play.when + '</td>' +
			        '<td>' + play.location + '</td>' +
			        '<td>' + play.duration + '</td>' +
			        '</tr>';
		}
		html += '</table>';

		stats_details.style.display = 'none';
		stats_details.style.paddingTop = '20px';
		stats_details.innerHTML = html;

		var stats_link = stats_toggle.querySelector('a');
		stats_link.addEventListener('click', function(e) {
			var display = stats_details.style.display;
			if (display == 'none') {
				stats_details.style.display = 'table';
			} else {
				stats_details.style.display = 'none';
			}
			e.preventDefault();
			return false;
		}, false);
	}

	return function init(form_id) {

		var form = document.getElementById(form_id);
		form.style.paddingBottom = '15px';

		var id = form.querySelector('input[name="id"]').value;
		var url = form.querySelector('input[name="audio_url"]').value;
		var btn = form.querySelector('input[type="submit"]');

		var play_label = btn.value;
		var pause_label = form.getAttribute('data-pause-label') || 'Playing...';

		var playing = false;
		var interval = null;

		setup(form);
		api_call('stats', {
			id: id
		}, setup_stats);

		form.addEventListener('submit', function(e) {
			playing = ! playing;
			if (playing) {
				play(id, url);
				btn.value = pause_label;
				interval = setInterval(function() {
					track_playback(id, url);
				}, 5000);
			} else {
				pause(id);
				btn.value = play_label;
				clearInterval(interval);
			}
			e.preventDefault();
			return false;
		});
	}
})();
