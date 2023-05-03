var audio_stories_init = (function() {

	var playing = false;
	var sm2_is_setup = false;
	var sm2_is_ready = false;
	var play_when_ready = null;
	var form, id, url, btn;
	var play_label, loading_label, pause_label;
	var story, story_play, sequence, story_moments;

	function api_call(endpoint, params, callback) {
		if (typeof audio_stories_api == 'undefined') {
			return;
		}

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

	function update_sequence() {
		var current = null;
		for (let i = 0; i < sequence.length; i++) {
			let time = sequence[i] * 1000;
			if (soundManager.sounds[id].position >= time) {
				current = story_moments[i];
				story_moments[i].classList.remove('hidden');
				setTimeout(() => {
					story_moments[i].classList.add('fadein');
				}, 0);
			}
		}
		var was_already_current = false;
		if (current) {
			was_already_current = current.classList.contains('story__moment--current');
		}
		if (! was_already_current) {
			let curr_moment = story.querySelector('.story__moment--current');
			if (curr_moment) {
				curr_moment.classList.remove('story__moment--current');
			}
		}
		if (current && ! was_already_current) {
			current.classList.add('story__moment--current');
			current.scrollIntoView(false);
			if (current.classList.contains('story__moment--pause')) {
				toggle();
			}
		}
	}

	function update_time() {
		var ms = soundManager.sounds[id].position;
		var mm = Math.floor(ms / 60000);
		var ss = parseInt((ms - mm * 60000) / 1000);
		if (mm < 10) {
			mm = `0${mm}`;
		}
		if (ss < 10) {
			ss = `0${ss}`;
		}
		story.querySelector('.story__time').innerHTML = `${mm}:${ss}`;
	}

	function play(id, url) {
		if (! sm2_is_ready) {
			play_when_ready = url;
			return;
		}
		if (! soundManager.sounds[id]) {
			soundManager.createSound({
				id: id,
				url: url,
				autoLoad: true,
				autoPlay: true,
				whileplaying: function(position) {
					btn.value = pause_label;
					if (story_play) {
						document.body.classList.add('story-open');
						story.classList.remove('hidden');
						story_play.innerHTML = 'Pause';
						story_play.classList.add('story__play--paused');
						update_sequence();
						update_time();
					}
				},
				onpause: function() {
					btn.value = play_label;
					if (story_play) {
						story_play.innerHTML = 'Play';
						story_play.classList.remove('story__play--paused');
					}
				}
			});
			api_call('play', {
				id: id,
				url: url,
				ajax: 1
			}, function(rsp) {
				if (rsp && rsp.play_id) {
					soundManager.sounds[id].play_id = rsp.play_id;
				}
			});
			btn.value = loading_label;
		} else {
			soundManager.sounds[id].play();
		}
	}

	function pause(id) {
		soundManager.sounds[id].pause();
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
					play(id, play_when_ready);
				}
			}
		});
	}

	function track_playback(id) {
		api_call('track', {
			play_id: soundManager.sounds[id].play_id,
			seconds: Math.round(soundManager.sounds[id].position / 1000)
		});
	}

	function toggle() {
		playing = ! playing;
		if (playing) {
			play(id, url);
			interval = setInterval(function() {
				track_playback(id, url);
			}, 5000);
		} else {
			pause(id);
			clearInterval(interval);
		}
	}

	function setup_story() {
		var story_text = story.querySelector('.story__text').innerHTML;
		if (story_text.trim() == '') {
			return;
		}

		var story_close = story.querySelector('.story__close');
		story_play = story.querySelector('.story__play');
		var story_rewind = story.querySelector('.story__rewind');
		var story_forward = story.querySelector('.story__forward');
		var story_sequence = story.querySelector('.story__sequence');

		story_close.addEventListener('click', () => {
			playing = true; // toggle() will reverse this
			toggle();
			story.classList.add('hidden');
			document.body.classList.remove('story-open');
		});

		story_play.addEventListener('click', () => {
			toggle();
		});

		story_rewind.addEventListener('click', () => {
			var sound = soundManager.sounds[id];
			sound.setPosition(Math.max(0, sound.position -= 10 * 1000));
			if (! playing) {
				setTimeout(() => {
					story_play.innerHTML = 'Play';
					story_play.classList.remove('story__play--paused');
				}, 100);
			}
		});

		story_forward.addEventListener('click', () => {
			var sound = soundManager.sounds[id];
			sound.setPosition(sound.position += 10 * 1000);
			if (! playing) {
				setTimeout(() => {
					story_play.innerHTML = 'Play';
					story_play.classList.remove('story__play--paused');
				}, 100);
			}
		});

		for (let el of [story_close, story_rewind, story_play, story_forward]) {
			el.addEventListener('touchstart', e => {
				e.target.classList.add('touch');
			});
			el.addEventListener('touchend', e => {
				e.target.classList.remove('touch');
			});
		}

		sequence = [];
		var html = '';
		var texts = story_text.split('\n');
		for (let text of texts) {
			text = text.trim();
			let regex = /^\[(\d\d):(\d\d.\d\d\d)( pause)?\]/;
			let timestamp = text.match(regex);
			let time = '';
			var pause = '';
			if (timestamp) {
				let min = parseInt(timestamp[1]);
				let sec = parseFloat(timestamp[2]);
				time = min * 60 + sec;
				text = text.replace(regex, '');
				sequence.push(time);
				if (timestamp[3]) {
					pause = ' story__moment--pause';
				}
			}
			html += `<div class="story__moment hidden${pause}">${text}</div>`;
		}
		story_sequence.innerHTML = html;
		story_moments = story_sequence.querySelectorAll('.story__moment');
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

	function resize() {
		var story_sequence = story.querySelector('.story__sequence');
		var story_controls = story.querySelector('.story__controls');
		var adminbar = document.getElementById('wpadminbar');
		var height = window.innerHeight - 63;
		if (adminbar) {
			height -= adminbar.offsetHeight;
		}
		story_sequence.style.height = height + 'px';
	}

	return function init(form_id) {

		form = document.getElementById(form_id);
		form.style.paddingBottom = '15px';

		id = form.querySelector('input[name="id"]').value;
		url = form.querySelector('input[name="audio_url"]').value;
		btn = form.querySelector('input[type="submit"]');

		play_label = btn.value;
		loading_label = form.getAttribute('data-loading-label') || 'Loading...';
		pause_label = form.getAttribute('data-pause-label') || 'Pause';

		story = form.querySelector('.story');

		var interval = null;

		setup(form);
		api_call('stats', {
			id: id
		}, setup_stats);
		setup_story();

		form.addEventListener('submit', function(e) {
			toggle();
			e.preventDefault();
			return false;
		});

		resize();
		window.addEventListener('resize', resize);
	}
})();
