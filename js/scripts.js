const markdown = document.body.innerHTML;
// Unhide body
document.body.textContent = '';
document.body.removeAttribute('style');

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
	this.make_unique = (str) => {
		const count = map.get(str);
		if (count === undefined) {
			map.set(str, 1);
			return str;
		}
		map.set(str, count + 1);
		return str + '!' + count;
	};
	return this;
})();

const scale = document.createElement('input')
scale.id = ID.make_unique('scale');
scale.type = 'number'
scale.value = '1.0'
let scale_denom = 1;
scale.min = 0
const scaled_values = [];
scale.addEventListener('change', (event) => {
	for (const sv of scaled_values) {
		sv.update();
	}
}, {passive: true});

let current_slide = null;
let current_elem = null;

function start_new_slide(presentation_ended = false) {
	start_new_slide.slide_num ??= 1;
	if (presentation_ended) {
		start_new_slide.slide_num = '';
	}
	current_slide = document.body.appendChild(document.createElement('div'));
	const slide_id = start_new_slide.slide_num == '' ? '' : start_new_slide.slide_num++;
	current_slide.setAttribute('data-slide-id', slide_id);
	current_elem = null;
}
function hypenize(str) {
	return str.replaceAll(/\s/g, '-');
}

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
	const append_text_fragment = (text) => {
		const node = document.createTextNode(text);
		if (elem_stack.length > 0) {
			elem_stack.at(-1).appendChild(node);
		} else {
			res.push(node)
		}
	};

	for (const part of str.split('$')) {
		normal_text = !normal_text;
		if (normal_text) {
			let str = part;
			while (str.length > 0) {
				let unmatched_length = str.search(/\*\*|--|https?:\/\//);
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
				if (str.startsWith('**')) {
					if (elem_stack.length > 0 && elem_stack.at(-1).tagName == 'B') {
						elem_stack.pop();
					} else {
						elem_stack.push(document.createElement('b'));
						res.push(elem_stack.at(-1));
					}
					str = str.slice(2);
				} else if (str.startsWith('--')) {
					append_text_fragment('–');
					str = str.slice(2);
				} else if ((m = str.match(/^https?:\/\/[\S]*(?<![.!',;:?])/))) {
					const a = elem_with_text('a', m[0]);
					a.href = m[0];
					res.push(a);
					str = str.slice(m[0].length);
				} else {
					alert(`BUG: unmatched fragment: ${str}`);
				}
			}
		} else {
			const elem = document.createElement('span');
			let m;
			if ((m = part.match(/^\s*scale(\s+(\d+(\.\d+)?)(\s*\/\s*(\d+(\.\d+)?)(\s+hide_denom)?)?)?\s*$/)) != null) {
				// scale x / y
				scale.value = m[2] ?? 1;
				scale_denom = m[5] ?? 1;
				res.push(scale);
				if (scale_denom != 1 && m[7] === undefined) {
					res.push(document.createTextNode(' / ' + scale_denom));
				}
			} else if ((m = part.match(/^\s*present\s*$/)) != null) {
				// present
				const a = document.createElement('a');
				a.classList.add('present');
				a.href = '#slide-1';
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
				res.push(a);
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
				res.push(elem);
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
								alert(`Use of undefined variable: ${name}`);
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
					res.push(elem);
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
	if (line.startsWith('~')) {
		if (line.startsWith('~~')) {
			start_new_slide(true);
			line = line.slice(2);
		} else {
			start_new_slide();
			line = line.slice(1);
		}
	}

	const add_heading = (level) => {
		const a = document.createElement('a');
		const h = current_slide.appendChild(elem_of('h' + level, ...parse_markdown_text(line.slice(level + 1).trim()), a));
		h.id = ID.make_unique(hypenize(h.textContent));
		if (level == 1 && document.querySelector('head > title') == null) {
			document.head.appendChild(elem_with_text('title', h.textContent));
		}
		current_elem = null;
	};

	if (line === '') {
		current_elem = null;
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
	} else if (line.startsWith('- ')) {
		current_elem = null;
		let ul = current_slide.appendChild(document.createElement('ul'));
		for (;;) {
			ul.appendChild(elem_of('li', ...parse_markdown_text(line.slice(2))));
			if (line_idx + 1 < lines.length && lines[line_idx + 1].match(/^~?- /) != null) {
				line = lines[++line_idx];
				if (line.startsWith('~')) {
					ul.style.marginBottom = '0px';
					line = line.slice(1);
					start_new_slide();
					ul = current_slide.appendChild(document.createElement('ul'));
				}
				continue;
			}
			break;
		}
	} else if (/^\d+\.\s/.test(line)) {
		current_elem = null;
		let ol = current_slide.appendChild(document.createElement('ol'));
		let item_num = parseInt(line.match(/^\d+/)[0]);
		ol.start = item_num;
		for (;;) {
			ol.appendChild(elem_of('li', ...parse_markdown_text(line.slice(line.match(/^\d+\.\s/)[0].length))));
			if (line_idx + 1 < lines.length && /^~?\d+\.\s/.test(lines[line_idx + 1])) {
				line = lines[++line_idx];
				++item_num;
				if (line.startsWith('~')) {
					ol.style.marginBottom = '0px';
					line = line.slice(1);
					start_new_slide();
					ol = current_slide.appendChild(document.createElement('ol'));
					ol.start = item_num;
				}
				continue;
			}
			break;
		}
	} else {
		if (current_elem?.tagName != 'P') {
			current_elem = current_slide.appendChild(document.createElement('p'));
		} else {
			current_elem.append('\n');
		}
		current_elem.append(...parse_markdown_text(line));
	}

	parse_markdown_lines(lines, line_idx + 1);
}

const przepisy_kulinarne_a = elem_with_text('a', 'przepisy-kulinarne');
przepisy_kulinarne_a.href = '.';
document.body.appendChild(elem_of('h1', przepisy_kulinarne_a));

start_new_slide();
parse_markdown_lines(markdown.split('\n').map(l => l.trimEnd()), 0);
anchors.add('[data-slide-id] > h1, h2, h3, h4, h5, h6'); // add anchor buttons to every h1, h2, etc. element

// Allow scrolling past the page end
const spacer = document.body.appendChild(document.createElement('div'));
spacer.style.marginTop = 'calc(100vh - 16px)';

function start_presentation(slide_to_show) {
	document.body.classList.add('presentation');
	slide_to_show.classList.add('active');
	slide_to_show.scrollIntoView({behavior: 'smooth', block: 'center'});
	history.replaceState(history.state, '', document.location.href.slice(0, -document.location.hash.length) + `#slide-${slide_to_show.getAttribute('data-slide-id')}`);

	const navigate = (direction) => {
		const current_slide = document.querySelector('[data-slide-id].active');
		const slide_id = current_slide.getAttribute('data-slide-id');
		const next_slide_id = parseInt(slide_id) + direction;
		const next_slide = document.querySelector(`[data-slide-id="${next_slide_id}"]`);
		if (next_slide == null) {
			end_presentation(true);
		} else {
			current_slide.classList.remove('active');
			next_slide.classList.add('active');
			next_slide.scrollIntoView({behavior: 'smooth', block: 'center'});
			history.replaceState(history.state, '', document.location.href.slice(0, -document.location.hash.length) + `#slide-${next_slide_id}`);
		}
	}

	start_presentation.buttons_listener = (event) => {
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
			return;
		}
		if (event.key === 'Escape') {
			end_presentation(true);
		} else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
			navigate(1);
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
			navigate(-1);
		}
	};

	const SWIPE_THRESHOLD = 4;
	let swipe_start = null;

	start_presentation.pointerdown_listener = (event) => {
		if (event.pointerType == 'touch') {
			swipe_start = {x: event.screenX, y: event.screenY};
		}
	};
	start_presentation.pointermove_listener = (event) => {
		if (swipe_start != null && event.pointerType == 'touch') {
			const delta_x = event.screenX - swipe_start.x;
			const delta_y = event.screenY - swipe_start.y;
			const abs_delta_x = Math.abs(delta_x);
			const abs_delta_y = Math.abs(delta_y);
			if (abs_delta_x > abs_delta_y) {
				if (delta_x > SWIPE_THRESHOLD) {
					navigate(-1);
					swipe_start = null;
				} else if (delta_x < -SWIPE_THRESHOLD) {
					navigate(1);
					swipe_start = null;
				}
			} else if (abs_delta_y > abs_delta_x) {
				if (delta_y > SWIPE_THRESHOLD) {
					navigate(-1);
					swipe_start = null;
				} else if (delta_y < -SWIPE_THRESHOLD) {
					navigate(1);
					swipe_start = null;
				}
			}
		}
		event.preventDefault();
	};

	document.addEventListener('keydown', start_presentation.buttons_listener, {passive: true});
	document.addEventListener('pointerdown', start_presentation.pointerdown_listener, {passive: true});
	document.addEventListener('pointermove', start_presentation.pointermove_listener);
}

function end_presentation(go_back_in_history) {
	document.body.classList.remove('presentation');
	document.querySelector('[data-slide-id].active')?.classList?.remove('active');
	document.removeEventListener('keydown', start_presentation.buttons_listener);
	document.removeEventListener('pointerdown', start_presentation.pointerdown_listener);
	document.removeEventListener('pointermove', start_presentation.pointermove_listener);
	if (go_back_in_history && history.length > 1) {
		history.back();
	} else {
		history.replaceState(history.state, '', document.location.href.slice(0, -document.location.hash.length));
	}
}

const start_presentation_if_url_selects_slide = () => {
	let m = document.location.hash.match(/^#slide-(\d+)$/);
	if (m != null) {
		const x = document.querySelector(`[data-slide-id="${m[1]}"]`);
		if (x) {
			start_presentation(x);
		}
	}
}

start_presentation_if_url_selects_slide();

window.onpopstate = (event) => {
	if (document.body.classList.contains('presentation')) {
		end_presentation(false);
	}
	start_presentation_if_url_selects_slide();
};
