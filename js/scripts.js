const markdown = document.head.querySelector('script[type="text/markdown"]').textContent;

function elem_with_text(tag, text) {
	const elem = document.createElement(tag);
	elem.innerText = text;
	return elem;
}
function elem_of(tag, ...args) {
	const elem = document.createElement(tag);
	elem.append(...args);
	return elem;
}

const ID = (() => {
	const map = new Map();
	return {
		make_unique: (str) => {
			const count = map.get(str);
			if (count === undefined) {
				map.set(str, 1);
				return str;
			}
			map.set(str, count + 1);
			return str + '!' + count;
		}
	};
})();

function decode_url_hash(url_hash = window.location.hash) {
	const m = url_hash.match(/^(#slide:(\d+)|##(.*))?$/);
	const slide_id = m?.[2];
	const fragment_identifier = m?.[3];
	console.log("fragment_identifier:", fragment_identifier);
	return {
		// slide_id and fragment_identifier cannot be set at the same time
		slide_id: slide_id == null ? null : parseInt(slide_id),
		fragment_identifier: fragment_identifier == null ? null : decodeURI(fragment_identifier),
	};
}
function encode_url_hash(decoded_hash) {
	let res = '';
	if (decoded_hash.slide_id != null) {
		res += `#slide:${decoded_hash.slide_id}`;
	} else if (decoded_hash.fragment_identifier != null) {
		res += `##${encodeURI(decoded_hash.fragment_identifier)}`;
	}
	return res;
}
function change_url_hash(decoded_hash_changer) {
	const decoded_hash = decode_url_hash();
	decoded_hash_changer(decoded_hash);
	const url_without_prefix = window.location.href.substring(0, window.location.href.length - window.location.hash.length);
	// Empty string in URL in history.replaceState() is no-op on Firefox and Chromium, hence the prefix.
	history.replaceState(history.state, '', url_without_prefix + encode_url_hash(decoded_hash));
}
function url_hash_of_fragment_identifier(fragment_identifier) {
	const decoded_hash = decode_url_hash();
	decoded_hash.slide_id = null;
	decoded_hash.fragment_identifier = fragment_identifier;
	return encode_url_hash(decoded_hash);
}
// TODO: encode current scale in URL and update the href links upon scale change

const scale = document.createElement('input')
scale.id = ID.make_unique('scale');
scale.type = 'number'
scale.value = '1.0'
let scale_denom = 1;
scale.min = 0
const update_scale_elem_width = () => {
	scale.style.width = `calc(${scale.value.length + 3}ch + 3px)`;
};
const scaled_values = [];
scale.addEventListener('input', update_scale_elem_width);
scale.addEventListener('change', (event) => {
	for (const sv of scaled_values) {
		sv.update();
	}
}, {passive: true});

const slide_elem_stack = (() => {
	const self = {};
	const elem_stack = [null];
	const elem_cloner_stack = [];
	self.change_slide_elem = (slide_elem) => {
		elem_stack[0] = slide_elem;
		for (let i = 1; i < elem_stack.length; ++i) {
			elem_stack[i] = elem_cloner_stack[i - 1](elem_stack[i]);
			elem_stack[i - 1].appendChild(elem_stack[i]);
		}
	};
	self.size = () => {
		return elem_stack.length - 1;
	};
	self.top = () => {
		return elem_stack.at(-1);
	};
	self.push = (new_slide_elem_cloner) => {
		elem_cloner_stack.push(new_slide_elem_cloner);
		const elem = new_slide_elem_cloner(null);
		self.top().appendChild(elem);
		elem_stack.push(elem);
	};
	self.pop = () => {
		// Remove element if it was empty
		const elem_to_pop = self.top();
		if (elem_to_pop.childElementCount == 0 && elem_to_pop.textContent.length == 0) {
			elem_to_pop.remove();
		}
		elem_stack.pop();
		elem_cloner_stack.pop();
	};
	self.reset = () => {
		// Leave only the slide elem
		while (elem_stack.length > 1) {
			self.pop();
		}
	};
	return self;
})();

const presentation = (() => {
	let currently_shown_slide = null;

	const buttons_listener = (event) => {
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
			return;
		}
		if (event.key === 'Escape') {
			presentation.show_slide(null);
		} else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
			presentation.show_slide(currently_shown_slide.id + 1);
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
			presentation.show_slide(currently_shown_slide.id - 1);
		}
	};

	let swipe_start = null;
	const pointerdown_listener = (event) => {
		if (event.pointerType == 'touch') {
			swipe_start = {x: event.screenX, y: event.screenY};
		}
	};
	const pointermove_listener = (event) => {
		if (swipe_start != null && event.pointerType == 'touch') {
			const delta_x = event.screenX - swipe_start.x;
			const delta_y = event.screenY - swipe_start.y;
			const abs_delta_x = Math.abs(delta_x);
			const abs_delta_y = Math.abs(delta_y);

			const SWIPE_THRESHOLD = 4;
			if (abs_delta_x > abs_delta_y) {
				if (delta_x > SWIPE_THRESHOLD) {
					presentation.show_slide(currently_shown_slide.id - 1);
					swipe_start = null;
				} else if (delta_x < -SWIPE_THRESHOLD) {
					presentation.show_slide(currently_shown_slide.id + 1);
					swipe_start = null;
				}
			} else if (abs_delta_y > abs_delta_x) {
				if (delta_y > SWIPE_THRESHOLD) {
					presentation.show_slide(currently_shown_slide.id - 1);
					swipe_start = null;
				} else if (delta_y < -SWIPE_THRESHOLD) {
					presentation.show_slide(currently_shown_slide.id + 1);
					swipe_start = null;
				}
			}
		}
		event.preventDefault();
	};

	return {
		builder: (() => {
			let currently_built_slide_num = 0;
			return {
				start_new_slide: () => {
					const slide = document.body.appendChild(document.createElement('div'));
					slide.setAttribute('data-slide-id', ++currently_built_slide_num);
					slide_elem_stack.change_slide_elem(slide);
				},
				end_presentation: () => {
					// Create slide without id that will contain rest of the HTML elements.
					slide_elem_stack.change_slide_elem(document.body.appendChild(document.createElement('div')));
				}
			};
		})(),
		// Pass null as slide_id to close the presentation.
		show_slide: (slide_id) => {
			const next_slide_elem = slide_id == null ? null : document.querySelector(`[data-slide-id="${slide_id}"]`);
			if (next_slide_elem == null) {
				if (currently_shown_slide != null) {
					// End presentation.
					currently_shown_slide.elem.classList.remove('active');
					currently_shown_slide = null;
					document.removeEventListener('keydown', buttons_listener);
					document.removeEventListener('pointerdown', pointerdown_listener);
					document.removeEventListener('pointermove', pointermove_listener);
					document.body.classList.remove('presentation');
					change_url_hash((decoded_hash) => {
						decoded_hash.slide_id = null;
					});
				}
				return;
			}

			if (currently_shown_slide == null) {
				// Start presentation.
				document.body.classList.add('presentation');
				document.addEventListener('keydown', buttons_listener, {passive: true});
				swipe_start = null;
				document.addEventListener('pointerdown', pointerdown_listener, {passive: true});
				document.addEventListener('pointermove', pointermove_listener);
			} else {
				currently_shown_slide.elem.classList.remove('active');
			}

			next_slide_elem.classList.add('active');
			next_slide_elem.scrollIntoView({behavior: 'smooth', block: 'center'});
			currently_shown_slide = {
				id: slide_id,
				elem: next_slide_elem,
			};
			change_url_hash((decoded_hash) => {
				if (decoded_hash.fragment_identifier != null) {
					// Starting presentation while something was navigated -> add history entry instead of replacing it.
					history.pushState(history.state, '', window.location.href);
				}
				decoded_hash.slide_id = slide_id;
			});
		},
	};
})();

function parse_markdown_text(str) {
	parse_markdown_text.vars ??= new Map();
	const vars = parse_markdown_text.vars;

	let add_br = false;
	if (str.endsWith('\\')) {
		str = str.slice(0, -1)
		add_br = true;
	}

	let normal_text = false;
	const res = [];
	let elem_stack = [];
	let str_styles_stack = [];
	const top_str_style_matches = (str_style_to_match) => {
		return str_styles_stack.length > 0 && str_styles_stack.at(-1) == str_style_to_match;
	};
	const append_elem = (elem) => {
		if (elem_stack.length > 0) {
			elem_stack.at(-1).appendChild(elem);
		} else {
			res.push(elem);
		}
	};
	const append_text_fragment = (text) => {
		append_elem(document.createTextNode(text));
	};

	for (const part of str.split('$')) {
		normal_text = !normal_text;
		if (normal_text) {
			let str = part;
			while (str.length > 0) {
				let unmatched_length = str.search(/\\?[\*_]|---?|https?:\/\/|\[.*?\]\(.*?\)|`.*?`/);
				if (unmatched_length == -1) {
					append_text_fragment(str);
					break;
				}
				// Append raw string
				if (unmatched_length > 0) {
					append_text_fragment(str.slice(0, unmatched_length));
					str = str.slice(unmatched_length);
				}
				// Stylize string
				let m;
				if (str.startsWith('\\')) {
					append_text_fragment(str[1]);
					str = str.slice(2);
				} else if (str.startsWith('***') || str.startsWith('___')) {
					if (top_str_style_matches(str.substring(0, 3))) {
						str_styles_stack.pop();
						elem_stack.pop();
					} else {
						const em = document.createElement('em');
						const b = em.appendChild(document.createElement('b'));
						append_elem(em);
						str_styles_stack.push(str.substring(0, 3));
						elem_stack.push(b);
					}
					str = str.slice(3);
				} else if (str.startsWith('**') || str.startsWith('__')) {
					if (top_str_style_matches(str.substring(0, 2))) {
						str_styles_stack.pop();
						elem_stack.pop();
					} else {
						const b = document.createElement('b');
						append_elem(b);
						str_styles_stack.push(str.substring(0, 2));
						elem_stack.push(b);
					}
					str = str.slice(2);
				} else if (str.startsWith('*') || str.startsWith('_')) {
					if (top_str_style_matches(str.substring(0, 1))) {
						str_styles_stack.pop();
						elem_stack.pop();
					} else {
						const em = document.createElement('em');
						append_elem(em);
						str_styles_stack.push(str.substring(0, 1));
						elem_stack.push(em);
					}
					str = str.slice(1);
				} else if (str.startsWith('---')) {
					append_text_fragment('—');
					str = str.slice(3);
				} else if (str.startsWith('--')) {
					append_text_fragment('–');
					str = str.slice(2);
				} else if ((m = str.match(/^https?:\/\/[\S]*(?<![.!',;:?])/))) {
					const a = elem_with_text('a', m[0]);
					a.href = m[0];
					append_elem(a);
					str = str.slice(m[0].length);
				} else if ((m = str.match(/^\[(.*?)\]\((.*?)\)/))) {
					const a = elem_with_text('a', m[1]);
					a.href = m[2];
					append_elem(a);
					str = str.slice(m[0].length);
				} else if ((m = str.match(/^`(.*?)`/))) {
					append_elem(elem_with_text('code', m[1]));
					str = str.slice(m[0].length);
				} else {
					alert(`BUG: unmatched fragment: ${str}`);
					append_text_fragment(str);
					str = "";
				}
			}
		} else {
			const elem = document.createElement('span');
			let m;
			if ((m = part.match(/^\s*scale(\s+(\d+(\.\d+)?)(\s*\/\s*(\d+(\.\d+)?)(\s+hide_denom)?)?)?\s*$/)) != null) {
				// scale x / y
				scale.value = m[2] ?? 1;
				update_scale_elem_width();
				scale_denom = m[5] ?? 1;
				append_elem(scale);
				if (scale_denom != 1 && m[7] === undefined) {
					append_text_fragment(' / ' + scale_denom);
				}
			} else if ((m = part.match(/^\s*present\s*$/)) != null) {
				// present
				const a = document.createElement('a');
				a.classList.add('present');
				const decoded_hash = decode_url_hash();
				decoded_hash.slide_id = 1;
				a.href = encode_url_hash(decoded_hash);
				a.innerHTML = `
					<svg fill="#000000" height="0.875em" width="0.875em" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
						 viewBox="0 0 17.804 17.804" xml:space="preserve">
					<g>
						<g id="c98_play">
							<path d="M2.067,0.043C2.21-0.028,2.372-0.008,2.493,0.085l13.312,8.503c0.094,0.078,0.154,0.191,0.154,0.313
								c0,0.12-0.061,0.237-0.154,0.314L2.492,17.717c-0.07,0.057-0.162,0.087-0.25,0.087l-0.176-0.04
								c-0.136-0.065-0.222-0.207-0.222-0.361V0.402C1.844,0.25,1.93,0.107,2.067,0.043z"/>
						</g>
						<g id="Capa_1_78_">
						</g>
					</g>
					</svg>`;
				a.addEventListener('click', (e) => {
					if (!e.ctrlKey) {
						presentation.show_slide(1);
						e.preventDefault();
					}
				});
				append_elem(a);
			} else if ((m = part.match(/^\s*(\S+)\s*=\s*(\d+(\.\d+)?)(\s*\S+)?\s*$/)) != null) {
				// name = value units
				const name = m[1];
				const value = m[2];
				const unit = m[4] ?? '';
				if (vars.has(name)) {
					alert(`Redefinition of the variable: ${name}`);
					return;
				}
				vars.set(name, {value: value, unit: unit});
				scaled_values.push({
					update: () => {
						elem.textContent = (Math.round(value * scale.value / scale_denom * 100) / 100) + unit;
					},
				})
				scaled_values.at(-1).update();
				append_elem(elem);
			} else if ((m = part.match(/^\s*\S+(\s*[+\-*/x]\s*\S+)*\s*$/))) {
				(() => {
					// expression
					let lexed = [];
					let expr = part;
					while (expr.length > 0) {
						expr = expr.trimStart();
						if ((m = expr.match(/^\d+(\.\d+)?\b/))) {
							lexed.push({type: 'num', value: parseFloat(m[0])})
							expr = expr.slice(m[0].length);
						} else if ((m = expr.match(/^[+\-]/))) {
							lexed.push({type: 'operator', kind: m[0], priority: 0});
							expr = expr.slice(m[0].length);
						} else if ((m = expr.match(/^[*/x]/))) {
							lexed.push({type: 'operator', kind: m[0], priority: 1});
							expr = expr.slice(m[0].length);
						} else if ((m = expr.match(/^\S+/))) {
							const x = vars.get(m[0]);
							if (x == null) {
								alert(`Use of undefined variable: ${m[0]}`);
								return;
							}
							lexed.push({type: 'var', var: x});
							expr = expr.slice(m[0].length);
						} else {
							alert(`Cannot parse expression: ${expr}`);
							return;
						}
					}
					const evalute_expression = () => {
						let val_stack = [];
						let unit_stack = [];
						let oper_stack = [];
						const normalize_by = (priority) => {
							console.assert(val_stack.length == unit_stack.length);
							console.assert(val_stack.length - 1 == oper_stack.length);
							while (oper_stack.length > 0 && oper_stack.at(-1).priority >= priority) {
								const b = val_stack.pop();
								const a = val_stack.pop();
								const b_unit = unit_stack.pop();
								const a_unit = unit_stack.pop();
								const oper = oper_stack.pop();

								if (a_unit == b_unit) {
									unit_stack.push(a_unit);
								} else if (a_unit == '') {
									unit_stack.push(b_unit);
								} else if (b_unit == '') {
									unit_stack.push(a_unit);
								} else {
									alert(`Computation on different units: ${a_unit} and ${b_unit}`);
									return 'error';
								}

								if (oper.kind == '+') {
									val_stack.push(a + b);
								} else if (oper.kind == '-') {
									val_stack.push(a - b);
								} else if (oper.kind == '*') {
									val_stack.push(a * b);
								} else if (oper.kind == '/') {
									val_stack.push(a / b);
								} else if (oper.kind == 'x') {
									val_stack.push(a * b);
								} else {
									throw Error('BUG');
								}
							}
						};

						for (const l of lexed) {
							if (l.type == 'num') {
								val_stack.push(l.value);
								unit_stack.push('');
							} else if (l.type == 'var') {
								val_stack.push(l.var.value * scale.value / scale_denom)
								unit_stack.push(l.var.unit);
							} else if (l.type == 'operator') {
								normalize_by(l.priority);
								oper_stack.push({kind: l.kind, priority: l.priority});
							} else {
								throw Error('BUG');
							}
						}
						normalize_by(0);
						return (Math.round(val_stack[0] * 100) / 100) + unit_stack[0];
					};
					scaled_values.push({
						update: () => {
							elem.textContent = evalute_expression();
						},
					});
					scaled_values.at(-1).update();
					append_elem(elem);
				})()
			} else {
				alert(`Unknown command: ${part}`)
			}
		}
	}
	if (add_br) {
		res.push(document.createElement('br'));
	}

	if (elem_stack.length > 0) {
		alert(`Unterminated stylization: <${elem_stack.at(-1).tagName}> in text: ${str}`);
	}
	return res;
}

function parse_markdown_lines(lines, line_idx) {
	if (line_idx >= lines.length) {
		return;
	}

	let line = lines[line_idx];
	let m;
	if ((m = line.match(/^\s*(~~?)/))) {
		if (m[1] == '~~') {
			presentation.builder.end_presentation();
		} else {
			presentation.builder.start_new_slide();
		}
		line = line.slice(0, m[0].length - m[1].length) + line.slice(m[0].length);
	}

	const add_heading = (level) => {
		slide_elem_stack.reset();
		const a = elem_of('a', ...parse_markdown_text(line.slice(level + 1).trim()));
		const h = slide_elem_stack.top().appendChild(elem_of('h' + level, a));
		h.id = ID.make_unique(h.textContent.trim());
		a.href = url_hash_of_fragment_identifier(h.id);
		if (level == 1 && document.querySelector('head > title') == null) {
			document.head.appendChild(elem_with_text('title', h.textContent));
		}
	};

	if (line.substr(0).trim() === '') {
		slide_elem_stack.reset();
	} else if (line.startsWith('# ')) {
		add_heading(1);
	} else if (line.startsWith('## ')) {
		add_heading(2);
	} else if (line.startsWith('### ')) {
		add_heading(3);
	} else if (line.startsWith('#### ')) {
		add_heading(4);
	} else if (line.startsWith('##### ')) {
		add_heading(5);
	} else if (line.startsWith('###### ')) {
		add_heading(6);
	} else if ((m = line.match(/^(\s*)(-\s+|(\d+)\.\s+)/))) {
		const indent = m[1].length;
		// Remove deeper elements
		while (slide_elem_stack.size() > 0) {
			if (slide_elem_stack.top().tagName == 'LI') {
				if (slide_elem_stack.top().dataset.indent <= indent) {
					break; // we removed all elements till the required indent level
				}
				slide_elem_stack.pop(); // li
				slide_elem_stack.top().style.marginBottom = '0px'; // no additional margin between list elems (after the more deep list element)
				slide_elem_stack.pop(); // ul or ol
			} else {
				slide_elem_stack.pop(); // any element we found
			}
		}
		const is_list_numbered = !m[2].startsWith('-');
		const list_tag_name = is_list_numbered ? 'ol' : 'ul';
		const li_cloner = (prev_elem) => {
			const li = document.createElement('li');
			li.dataset.indent = indent;
			if (prev_elem) {
				li.classList.add('hide-marker');
			}
			return li;
		};
		const start_new_list = () => {
			slide_elem_stack.push((prev_elem) => {
				const list_elem = document.createElement(list_tag_name);
				list_elem.dataset.indent = indent;
				if (is_list_numbered) {
					if (prev_elem) {
						list_elem.start = prev_elem.start + prev_elem.querySelectorAll(':scope > li:not(.hide-marker)').length;
					} else {
						list_elem.start = parseInt(m[3]);
					}
				}
				if (prev_elem) {
					prev_elem.style.marginBottom = '0px'; // no additional margin between list elems
				}
				return list_elem;
			});
			slide_elem_stack.push(li_cloner);
		};
		// Append the li element
		if (slide_elem_stack.top().tagName == 'LI') {
			if (slide_elem_stack.top().dataset.indent < indent) {
				start_new_list();
			} else {
				console.assert(slide_elem_stack.top().dataset.indent == indent);
				slide_elem_stack.pop(); // li
				if (slide_elem_stack.top().tagName == list_tag_name.toUpperCase()) {
					// The same kind of list
					slide_elem_stack.push(li_cloner);
				} else {
					// Other kind of list
					slide_elem_stack.top().style.marginBottom = '0px'; // no additional margin between list elems (after the more deep list element)
					slide_elem_stack.pop(); // ul or ol
					start_new_list();
				}
			}
		} else {
			start_new_list();
		}
		slide_elem_stack.top().append(...parse_markdown_text(line.slice(m[0].length)));
	} else {
		if (slide_elem_stack.top().tagName != 'P' && slide_elem_stack.top().tagName != 'LI') {
			slide_elem_stack.push(() => document.createElement('p'));
		} else {
			slide_elem_stack.top().append('\n');
		}
		slide_elem_stack.top().append(...parse_markdown_text(line));
	}

	parse_markdown_lines(lines, line_idx + 1);
}

const przepisy_kulinarne_a = elem_with_text('a', 'przepisy-kulinarne');
przepisy_kulinarne_a.href = root_dir;
document.body.appendChild(elem_of('h1', przepisy_kulinarne_a));

presentation.builder.start_new_slide();
parse_markdown_lines(markdown.split('\n').map(l => l.trimEnd()), 0);

document.body.addEventListener('click', (event) => {
	if (!event.ctrlKey &&
			event.target.tagName == 'A' &&
			event.target.attributes.getNamedItem("href")?.value?.[0] == '#' &&
			event.target.hash == window.location.hash) {
		// When window.location.hash == event.target.hash, popstate event is not triggered so
		// the popstate handler won't navigate to the element, so we need to do it manually.
		document.getElementById(decode_url_hash(event.target.hash).fragment_identifier)?.scrollIntoView();
	}
}, {passive: true});

/*
Navigation should work like this:
	* opening site ->
		- slide: open slide;
		- non-slide -> scroll
	* clicking present ->
		- slide: replace slide
		- empty hash -> open slide
		- other hash -> add history entry, open slide
	* Ctrl + clicking present ->
	    - open: slide 1 in the new tap
	* going back ->
		- slide: replace;
		- non-slide -> close slide if open (don't scroll - browser should jump scroll position by itself)
	* going forward ->
		- slide: open / replace slide
		- non-slide -> close slide if open (don't scroll - browser should jump scroll position by itself)
	* navigating by changing the url:
		- slide: open / change slide
		- non-slide -> navigate
*/
function popstate_handler() {
	const decoded_hash = decode_url_hash();
	presentation.show_slide(decoded_hash.slide_id);
	if (decoded_hash.fragment_identifier != null) {
		// This is no-op if popstate was caused going back / forth in history.
		document.getElementById(decoded_hash.fragment_identifier)?.scrollIntoView();
	}
}

window.addEventListener('popstate', popstate_handler);
popstate_handler();
