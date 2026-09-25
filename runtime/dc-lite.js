/*
 * dc-lite — a small, dependency-free runtime for `.dc.html` components.
 *
 * It renders the SoftBees prototype outside the Design canvas with the same
 * template semantics the canvas uses:
 *   - {{ path }} holes (whole-value attribute holes pass the raw value)
 *   - <sc-if value>, <sc-for list as>, <dc-import name>, <helmet>
 *   - `class Component extends DCLogic { renderVals() {} }` logic classes
 *
 * Requires React 18 + ReactDOM 18 on `window` (see index.html).
 */
(function () {
  'use strict';

  var React = window.React;
  var ReactDOM = window.ReactDOM;
  if (!React || !ReactDOM) throw new Error('dc-lite: load React and ReactDOM before runtime/dc-lite.js');
  var h = React.createElement;

  var COMPONENT_DIR = 'components/';
  var CAMEL = 'sc-camel-';
  // The HTML parser would re-parent these tags, so they are renamed while parsing and restored when rendering
  var RAW_TAGS = {
    select: 'sc-raw-select', table: 'sc-raw-table', tbody: 'sc-raw-tbody', thead: 'sc-raw-thead',
    tfoot: 'sc-raw-tfoot', tr: 'sc-raw-tr', td: 'sc-raw-td', th: 'sc-raw-th', caption: 'sc-raw-caption'
  };
  var RAW_BACK = {};
  Object.keys(RAW_TAGS).forEach(function (k) { RAW_BACK[RAW_TAGS[k]] = k; });
  var EVENTS = {
    onclick: 'onClick', onchange: 'onChange', oninput: 'onInput', onsubmit: 'onSubmit', onkeydown: 'onKeyDown',
    onkeyup: 'onKeyUp', onkeypress: 'onKeyPress', onmousedown: 'onMouseDown', onmouseup: 'onMouseUp',
    onmouseenter: 'onMouseEnter', onmouseleave: 'onMouseLeave', onfocus: 'onFocus', onblur: 'onBlur',
    ondoubleclick: 'onDoubleClick', oncontextmenu: 'onContextMenu', onmousemove: 'onMouseMove',
    onmouseover: 'onMouseOver', onmouseout: 'onMouseOut', onpointerdown: 'onPointerDown', onpointerup: 'onPointerUp',
    onpointermove: 'onPointerMove', onpointerenter: 'onPointerEnter', onpointerleave: 'onPointerLeave',
    onpointercancel: 'onPointerCancel', ontouchstart: 'onTouchStart', ontouchend: 'onTouchEnd',
    ontouchmove: 'onTouchMove', ontouchcancel: 'onTouchCancel', onscroll: 'onScroll', onwheel: 'onWheel',
    onanimationstart: 'onAnimationStart', onanimationend: 'onAnimationEnd', ontransitionend: 'onTransitionEnd'
  };

  var warned = new Set();
  function warnOnce(key, msg) { if (!warned.has(key)) { warned.add(key); console.warn('[dc-lite] ' + msg); } }
  function toCamel(s) { return s.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); }); }
  function toKebab(s) { return s.indexOf('--') === 0 ? s : s.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }); }

  // ---------------------------------------------------------------- expressions

  var IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*/;
  var NUMBER = /^-?\d+(\.\d+)?$/;

  function wrapped(e) {
    var depth = 0;
    for (var i = 0; i < e.length - 1; i++) {
      if (e[i] === '(') depth++;
      else if (e[i] === ')' && --depth === 0) return false;
    }
    return true;
  }

  function findComparison(e) {
    var depth = 0;
    for (var i = 0; i < e.length; i++) {
      var c = e[i];
      if (c === '[' || c === '(') depth++;
      else if (c === ']' || c === ')') depth--;
      else if (depth === 0 && (c === '=' || c === '!') && e[i + 1] === '=') {
        if ((i > 0 && (e[i - 1] === '=' || e[i - 1] === '!')) || !e.slice(0, i).trim()) continue;
        return { index: i, op: e[i + 2] === '=' ? c + '==' : c + '=' };
      }
    }
    return null;
  }

  function lookup(scope, e) {
    var m = e.match(IDENT);
    if (!m) return undefined;
    var v = scope == null ? undefined : scope[m[0]];
    var i = m[0].length;
    while (i < e.length) {
      if (e[i] === '.') {
        var seg = e.slice(i + 1).match(IDENT) || e.slice(i + 1).match(/^\d+/);
        if (!seg) return undefined;
        v = v == null ? undefined : v[seg[0]];
        i += 1 + seg[0].length;
      } else if (e[i] === '[') {
        var depth = 1, j = i + 1;
        for (; j < e.length && depth > 0; j++) {
          if (e[j] === '[') depth++;
          else if (e[j] === ']' && --depth === 0) break;
        }
        if (depth !== 0) return undefined;
        var k = evaluate(scope, e.slice(i + 1, j));
        v = v == null ? undefined : v[k];
        i = j + 1;
      } else return undefined;
    }
    return v;
  }

  function evaluate(scope, expr) {
    var e = String(expr).trim();
    if (!e) return undefined;
    if (e[0] === '(' && e[e.length - 1] === ')' && wrapped(e)) return evaluate(scope, e.slice(1, -1));
    var cmp = findComparison(e);
    if (cmp) {
      var a = evaluate(scope, e.slice(0, cmp.index));
      var b = evaluate(scope, e.slice(cmp.index + cmp.op.length));
      switch (cmp.op) {
        case '===': return a === b;
        case '!==': return a !== b;
        case '==': return a == b; // eslint-disable-line eqeqeq
        default: return a != b; // eslint-disable-line eqeqeq
      }
    }
    if (e[0] === '!') return !evaluate(scope, e.slice(1));
    if (e === 'true') return true;
    if (e === 'false') return false;
    if (e === 'null') return null;
    if (e === 'undefined') return undefined;
    if (NUMBER.test(e)) return Number(e);
    if (e.length >= 2 && (e[0] === '"' || e[0] === "'") && e[e.length - 1] === e[0]) return e.slice(1, -1);
    return lookup(scope, e);
  }

  // An attribute value: "{{x}}" alone yields the raw value, mixed text yields a string
  function getter(src) {
    var whole = src.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
    if (whole) return function (s) { return evaluate(s, whole[1]); };
    if (src.indexOf('{{') !== -1) {
      var parts = src.split(/\{\{([\s\S]+?)\}\}/g);
      return function (s) {
        return parts.map(function (p, i) {
          if (!(i & 1)) return p;
          var v = evaluate(s, p);
          return v == null ? '' : v;
        }).join('');
      };
    }
    return function () { return src; };
  }

  // ---------------------------------------------------------------- styles

  function styleObject(str) {
    var out = {};
    str.split(';').forEach(function (decl) {
      var i = decl.indexOf(':');
      if (i < 0) return;
      var k = decl.slice(0, i).trim();
      out[k.indexOf('--') === 0 ? k : toCamel(k)] = decl.slice(i + 1).trim();
    });
    return out;
  }

  // Inline style strings are also written as cssText, exactly as authored; React's style object alone
  // would not reproduce declaration order or shorthand behaviour.
  function cssApplier(css, keep) {
    var key = css == null ? undefined : css + '\0' + keep.join(';');
    return function (el) {
      if (!el || el.__dcCss === key) return;
      el.__dcCss = key;
      var st = el.style;
      var kept = keep.map(function (p) { return [p, st.getPropertyValue(p)]; });
      st.cssText = css || '';
      for (var i = st.length; i-- > 0;) {
        var p = st[i];
        if (!st.getPropertyPriority(p)) continue;
        var v = st.getPropertyValue(p);
        if (v) st.setProperty(p, v);
        if (st.getPropertyPriority(p)) st.removeProperty(p);
      }
      kept.forEach(function (kv) { if (kv[1]) st.setProperty(kv[0], kv[1]); });
    };
  }

  function setRef(ref, el) { if (typeof ref === 'function') ref(el); else ref.current = el; }
  function cached(map, limit, key, make) {
    var v = map.get(key);
    if (!v) {
      if (map.size >= limit) map.delete(map.keys().next().value);
      map.set(key, v = make());
    }
    return v;
  }
  var composedRefs = new WeakMap();
  // Ref callbacks stay identical between renders while an element's style string and user ref are unchanged
  function refFactory() {
    var plain = new Map();
    return function (css, keep, userRef) {
      var key = (css == null ? 'none' : 'css:' + css) + '\0' + keep.join(';');
      var make = function () { return cssApplier(css, keep); };
      if (userRef == null || (typeof userRef !== 'function' && typeof userRef !== 'object')) return cached(plain, 64, key, make);
      var byCss = composedRefs.get(userRef);
      if (!byCss) composedRefs.set(userRef, byCss = new Map());
      return cached(byCss, 1024, key, function () {
        var apply = make();
        return function (el) { apply(el); setRef(userRef, el); };
      });
    };
  }

  // ---------------------------------------------------------------- template compiler

  var ATTR_TEXT = '(?:[^>"\']|"[^"]*"|\'[^\']*\')*';
  var SELF_CLOSING_IMPORT = new RegExp('<(x-import|dc-import)(' + ATTR_TEXT + ')/>', 'gi');
  var CAMEL_ATTR = /(\s)([a-z]+[A-Z][A-Za-z0-9]*)(\s*=)/g;

  function prepare(html) {
    html = html.replace(SELF_CLOSING_IMPORT, function (m, tag, attrs) { return '<' + tag + attrs + '></' + tag + '>'; });
    html = html.replace(/<helmet(\s|>)/gi, '<sc-helmet$1').replace(/<\/helmet\s*>/gi, '</sc-helmet>');
    // The HTML parser lowercases attribute names; keep camelCase names (onClick, viewBox…) recoverable
    html = html.replace(CAMEL_ATTR, function (m, sp, name, eq) {
      return sp + CAMEL + name.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }) + eq;
    });
    Object.keys(RAW_TAGS).forEach(function (tag) {
      html = html.replace(new RegExp('(</?)' + tag + '(?=[\\s>])', 'gi'), '$1' + RAW_TAGS[tag]);
    });
    return html;
  }

  function readAttrs(el, kind) {
    var props = [];
    Array.prototype.slice.call(el.attributes).forEach(function (a) {
      var name = a.name;
      if (name.indexOf(CAMEL) === 0) name = toCamel(name.slice(CAMEL.length));
      if (name === 'hint-size') return;
      if (name.indexOf('style-') === 0) { warnOnce('pseudo', 'style-* pseudo-class attributes are not supported'); return; }
      if (kind === 'import') {
        if (name.indexOf('-') !== -1) name = toCamel(name);
      } else if (name === 'class') name = 'className';
      else if (name === 'for') name = 'htmlFor';
      else if (name.indexOf('on') === 0) name = EVENTS[name] || 'on' + name[2].toUpperCase() + name.slice(3);
      props.push([name, getter(a.value)]);
    });
    return props;
  }

  function compileChildren(parent, ctx) {
    var out = [];
    Array.prototype.forEach.call(parent.childNodes, function (n) {
      var c = compileNode(n, ctx);
      if (c) out.push(c);
    });
    return out;
  }
  function renderAll(list, scope, host) { return list.map(function (fn, i) { return fn(scope, host, i); }); }

  function compileNode(node, ctx) {
    if (node.nodeType === 3) return compileText(node);
    if (node.nodeType !== 1) return null;
    var tag = node.tagName.toLowerCase();
    if (tag === 'sc-for') return compileFor(node, ctx);
    if (tag === 'sc-if') return compileIf(node, ctx);
    if (tag === 'sc-helmet') return compileHelmet(node, ctx);
    if (tag === 'dc-import') return compileImport(node, ctx);
    return compileElement(node, ctx);
  }

  function compileText(node) {
    var text = node.nodeValue || '';
    if (text.indexOf('{{') === -1) {
      if (!text.trim() && text.indexOf(' ') === -1) return null;
      return function () { return text; };
    }
    var parts = text.split(/\{\{([\s\S]+?)\}\}/g);
    return function (scope, host, key) {
      return h(React.Fragment, { key: key }, parts.map(function (p, i) {
        if (!(i & 1)) return p;
        var v = evaluate(scope, p);
        if (v === undefined) { warnOnce('hole:' + p, '{{ ' + p.trim() + ' }} never resolved — rendered as empty'); return null; }
        if (React.isValidElement(v) || Array.isArray(v)) return h(React.Fragment, { key: i }, v);
        if (v === null || typeof v === 'boolean') return null;
        return h('span', { key: i, className: 'sc-interp' }, String(v));
      }));
    };
  }

  function compileFor(node, ctx) {
    var list = getter(node.getAttribute('list') || '');
    var as = node.getAttribute('as') || 'item';
    var body = compileChildren(node, ctx);
    return function (scope, host, key) {
      var items = list(scope);
      if (!Array.isArray(items)) items = [];
      return h(React.Fragment, { key: key }, items.map(function (item, i) {
        var s = Object.assign({}, scope);
        s[as] = item;
        s.$index = i;
        return h(React.Fragment, { key: i }, renderAll(body, s, host));
      }));
    };
  }

  function compileIf(node, ctx) {
    var cond = getter(node.getAttribute('value') || '');
    var body = compileChildren(node, ctx);
    return function (scope, host, key) {
      return cond(scope) ? h(React.Fragment, { key: key }, renderAll(body, scope, host)) : null;
    };
  }

  // <helmet> contents go to <head>: <style> blocks are kept per component, <link>/<meta>/<script> once
  function compileHelmet(node, ctx) {
    var kids = Array.prototype.slice.call(node.children);
    return function () {
      kids.forEach(function (el, i) {
        var tag = el.tagName;
        if (tag === 'SCRIPT' || tag === 'LINK' || tag === 'META') {
          var id = tag + '|' + (el.getAttribute('src') || el.getAttribute('href') || el.outerHTML);
          if (ctx.headOnce.has(id)) return;
          ctx.headOnce.add(id);
          var copy = document.createElement(tag.toLowerCase());
          Array.prototype.forEach.call(el.attributes, function (a) { copy.setAttribute(a.name, a.value); });
          if (el.textContent) copy.textContent = el.textContent;
          document.head.appendChild(copy);
          return;
        }
        var slot = ctx.name + '|' + i;
        var target = ctx.headSlots.get(slot);
        if (!target || target.tagName !== tag) {
          if (target) target.remove();
          target = document.createElement(tag.toLowerCase());
          target.setAttribute('data-dc-component', ctx.name);
          ctx.headSlots.set(slot, target);
          document.head.appendChild(target);
        }
        Array.prototype.forEach.call(el.attributes, function (a) {
          if (target.getAttribute(a.name) !== a.value) target.setAttribute(a.name, a.value);
        });
        if (target.textContent !== el.textContent) target.textContent = el.textContent;
      });
      return null;
    };
  }

  function compileImport(node, ctx) {
    var name = node.getAttribute('name') || node.getAttribute('component') || '';
    node.removeAttribute('name');
    node.removeAttribute('component');
    node.removeAttribute('style');
    var props = readAttrs(node, 'import');
    var body = compileChildren(node, ctx);
    ctx.imports.add(name);
    return function (scope, host, key) {
      var p = { key: key };
      props.forEach(function (pg) {
        var v = pg[1](scope);
        if (pg[0] === 'dcProps') { if (v && typeof v === 'object') Object.assign(p, v); return; }
        p[pg[0]] = v;
      });
      if (body.length) p.children = renderAll(body, scope, host);
      return h(componentFor(name), p);
    };
  }

  function compileElement(node, ctx) {
    var tag = RAW_BACK[node.localName] || node.localName;
    var props = readAttrs(node, 'dom');
    var body = compileChildren(node, ctx);
    var refFor = refFactory();
    return function (scope, host, key) {
      var p = { key: key };
      var css = null;
      props.forEach(function (pg) {
        var n = pg[0], v = pg[1](scope);
        if (n === 'style' && typeof v === 'string') { css = v; v = styleObject(v); }
        if ((n === 'value' || n === 'checked') && v === undefined) v = n === 'checked' ? false : '';
        p[n] = v;
      });
      var keep = css == null && p.style && typeof p.style === 'object' ? Object.keys(p.style).map(toKebab) : [];
      p.ref = refFor(css, keep.sort(), p.ref);
      return h.apply(null, [tag, p].concat(renderAll(body, scope, host)));
    };
  }

  function compileTemplate(html, name) {
    var tpl = document.createElement('template');
    tpl.innerHTML = prepare(html);
    var ctx = { name: name, imports: new Set(), headOnce: headOnce, headSlots: headSlots };
    var roots = compileChildren(tpl.content, ctx);
    var render = function (vals, host) { return renderAll(roots, vals || {}, host); };
    render.imports = ctx.imports;
    return render;
  }
  var headOnce = new Set();
  var headSlots = new Map();

  // ---------------------------------------------------------------- components

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
    this.__host = null;
  }
  DCLogic.prototype.setState = function (update, cb) { if (this.__host) this.__host.__setLogicState(update, cb); };
  DCLogic.prototype.forceUpdate = function () { if (this.__host) this.__host.forceUpdate(); };
  DCLogic.prototype.componentDidMount = function () {};
  DCLogic.prototype.componentDidUpdate = function () {};
  DCLogic.prototype.componentWillUnmount = function () {};
  DCLogic.prototype.renderVals = function () { return {}; };

  var registry = new Map(); // name -> { tpl, Logic, defaults, logicError }

  function parseComponent(source, name) {
    var open = /<x-dc(?:\s[^>]*)?>/.exec(source);
    var close = source.lastIndexOf('</x-dc>');
    if (!open || close < open.index) throw new Error('dc-lite: ' + name + '.dc.html has no <x-dc> block');
    var template = source.slice(open.index + open[0].length, close);
    var doc = new DOMParser().parseFromString(source, 'text/html');
    var script = doc.querySelector('script[data-dc-script]');
    var defaults = {};
    try {
      var meta = JSON.parse((script && script.getAttribute('data-props')) || '{}') || {};
      Object.keys(meta).forEach(function (k) {
        if (k[0] !== '$' && meta[k] && meta[k].default !== undefined) defaults[k] = meta[k].default;
      });
    } catch (e) { console.error('[dc-lite] invalid data-props in ' + name, e); }
    var def = { tpl: compileTemplate(template, name), Logic: null, defaults: defaults, logicError: null };
    if (script && script.textContent.trim()) {
      try {
        // eslint-disable-next-line no-new-func
        var Logic = new Function('DCLogic', 'StreamableLogic', 'React',
          script.textContent + '\n;return (typeof Component !== "undefined" && Component) || undefined;')(DCLogic, DCLogic, React);
        if (typeof Logic === 'function') def.Logic = Logic;
        else def.logicError = name + '.dc.html: <script data-dc-script> must define `class Component extends DCLogic`';
      } catch (e) {
        console.error('[dc-lite] logic class failed for ' + name, e);
        def.logicError = name + ': ' + (e && e.message ? e.message : String(e));
      }
    }
    return def;
  }

  function load(name, seen) {
    seen = seen || new Map();
    if (seen.has(name)) return seen.get(name);
    var p = fetch(COMPONENT_DIR + encodeURIComponent(name) + '.dc.html')
      .then(function (r) {
        if (!r.ok) throw new Error('dc-lite: could not load ' + COMPONENT_DIR + name + '.dc.html (HTTP ' + r.status + ')');
        return r.text();
      })
      .then(function (src) {
        var def = parseComponent(src, name);
        registry.set(name, def);
        return Promise.all(Array.from(def.tpl.imports).map(function (n) { return load(n, seen); }));
      });
    seen.set(name, p);
    return p;
  }

  var hostTypes = new Map();
  function componentFor(name) {
    if (hostTypes.has(name)) return hostTypes.get(name);

    function Host(props) {
      React.Component.call(this, props);
      this.state = { v: 0, err: null };
      var def = registry.get(name);
      var Logic = (def && def.Logic) || DCLogic;
      try {
        this.logic = new Logic(this.userProps());
        this.ctorError = null;
      } catch (e) {
        console.error(e);
        this.ctorError = name + ': ' + (e && e.message ? e.message : String(e));
        this.logic = new DCLogic(this.userProps());
      }
      this.logic.__host = this;
    }
    Host.prototype = Object.create(React.Component.prototype);
    Host.prototype.constructor = Host;
    Host.displayName = name;
    Host.getDerivedStateFromError = function (e) { return { err: e && e.message ? e.message : String(e) }; };
    Host.prototype.componentDidCatch = function (e, info) {
      console.error('[dc-lite] render error in <' + name + '>:', e, (info && info.componentStack) || '');
    };
    Host.prototype.userProps = function () { return Object.assign({}, this.props); };
    // Logic state merges synchronously (reads right after setState see the new value); the host then re-renders
    Host.prototype.__setLogicState = function (update, cb) {
      var prev = this.logic.state;
      var patch = typeof update === 'function' ? update(prev) : update;
      this.logic.state = Object.assign({}, prev, patch);
      this.setState(function (s) { return { v: s.v + 1 }; }, cb);
    };
    Host.prototype.__safe = function (fn, arg) {
      try { fn.call(this.logic, arg); } catch (e) {
        warnOnce('life:' + name + ':' + (e && e.message), name + ': lifecycle error — ' + (e && e.message ? e.message : e));
      }
    };
    Host.prototype.componentDidMount = function () { this.__safe(this.logic.componentDidMount); };
    // Like the canvas runtime, logic.componentDidUpdate receives the previous props only
    Host.prototype.componentDidUpdate = function (prevProps) {
      this.logic.props = this.userProps();
      this.__safe(this.logic.componentDidUpdate, prevProps);
    };
    Host.prototype.componentWillUnmount = function () { this.__safe(this.logic.componentWillUnmount); };
    Host.prototype.render = function () {
      var def = registry.get(name);
      var base = { className: 'sc-host', 'data-sc-name': name };
      if (this.state.err) return h('div', Object.assign({}, base, { className: 'sc-host sc-has-error' }), h('div', { className: 'sc-logic-error' }, name + ': ' + this.state.err));
      if (!def) return h('div', base);
      var up = this.userProps();
      this.logic.props = up;
      var vals = up;
      var err = def.logicError || this.ctorError;
      try { vals = Object.assign({}, up, this.logic.renderVals() || {}); } catch (e) {
        console.error(e);
        err = name + '.renderVals(): ' + (e && e.message ? e.message : String(e));
      }
      return h('div', Object.assign({}, base, err ? { className: 'sc-host sc-has-error' } : null),
        err ? h('div', { className: 'sc-logic-error' }, err) : null,
        def.tpl(vals, this));
    };

    hostTypes.set(name, Host);
    return Host;
  }

  var BASE_CSS = '.sc-host.sc-has-error{position:relative}' +
    '.sc-logic-error{position:absolute;top:8px;left:8px;z-index:2147483647;max-width:60ch;padding:6px 10px;' +
    'background:#b00020;color:#fff;font:12px/1.4 ui-monospace,monospace;border-radius:4px;white-space:pre-wrap;pointer-events:none}';

  function mount(el, name, props) {
    var style = document.createElement('style');
    style.textContent = BASE_CSS;
    document.head.insertBefore(style, document.head.firstChild);
    return load(name).then(function () {
      var def = registry.get(name);
      var root = ReactDOM.createRoot(el);
      root.render(h(componentFor(name), Object.assign({}, def.defaults, props || {})));
      return root;
    }).catch(function (e) {
      console.error(e);
      el.textContent = String(e && e.message ? e.message : e);
      throw e;
    });
  }

  window.DCLogic = DCLogic;
  window.DCLite = { mount: mount, evaluate: evaluate, prepare: prepare };
})();
