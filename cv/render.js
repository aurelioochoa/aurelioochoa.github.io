// Minimal mustache-style renderer for the CV template.
// Supports {{path.to.key}} (HTML-escaped), {{#each path}}...{{/each}}
// (current item bound to "this"), and {{#if path}}...{{/if}}.
// Any missing key throws, so a data file that drifts from the
// template fails the build loudly instead of printing blanks.

function lookup(data, path) {
  return path.split('.').reduce((obj, key) => {
    if (obj == null || typeof obj !== 'object' || !(key in obj)) {
      throw new Error(`Missing key "${path}" in data`);
    }
    return obj[key];
  }, data);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function interpolate(text, data) {
  return text.replace(/{{([\w.]+)}}/g, (_, path) => escapeHtml(String(lookup(data, path))));
}

export function render(template, data) {
  const openRe = /{{#(each|if) ([\w.]+)}}/;
  let out = '';
  let rest = template;
  let m;
  while ((m = rest.match(openRe))) {
    out += interpolate(rest.slice(0, m.index), data);
    const [open, kind, path] = m;
    const bodyStart = m.index + open.length;
    const tagRe = /{{#(?:each|if) [\w.]+}}|{{\/(?:each|if)}}/g;
    tagRe.lastIndex = bodyStart;
    let depth = 1;
    let bodyEnd = -1;
    let closeEnd = -1;
    let tag;
    while ((tag = tagRe.exec(rest))) {
      depth += tag[0][2] === '#' ? 1 : -1;
      if (depth === 0) {
        bodyEnd = tag.index;
        closeEnd = tagRe.lastIndex;
        break;
      }
    }
    if (bodyEnd < 0) throw new Error(`Unclosed {{#${kind} ${path}}}`);
    const body = rest.slice(bodyStart, bodyEnd);
    const value = lookup(data, path);
    if (kind === 'each') {
      for (const item of value) out += render(body, { ...data, this: item });
    } else if (value) {
      out += render(body, data);
    }
    rest = rest.slice(closeEnd);
  }
  return out + interpolate(rest, data);
}
