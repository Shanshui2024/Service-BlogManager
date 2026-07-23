// yaml.js — minimal YAML parser/serializer. Supports nested mappings, lists,
// list-of-mappings, quoted scalars, flow-style arrays, and inline comments
// only well enough to round-trip this app's config.yml / post front-matter.
export function parseConfigYaml(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, "")) // strip trailing comments (not inside quotes)
    .filter((l) => l.trim().length > 0);
  let i = 0;
  const indent = (s) => s.match(/^( *)/)[1].length;

  function isListItem(s) {
    return /^\s*-\s+/.test(s);
  }
  function isKv(s) {
    return /^\s*[\w一-龥][\w一-龥\-]*\s*:/.test(s);
  }

  function unquote(v) {
    v = v.trim();
    if (!v) return v;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1);
    }
    if (v.startsWith("[") && v.endsWith("]")) {
      return v
        .slice(1, -1)
        .split(",")
        .map((s) => unquote(s.trim()))
        .filter((s) => s.length > 0);
    }
    return v;
  }

  function parseScalar(v) {
    return unquote(v);
  }

  function parseBlock(baseIndent) {
    const obj = {};
    while (i < lines.length) {
      const line = lines[i];
      const ind = indent(line);
      if (ind < baseIndent) break;
      if (ind > baseIndent) {
        i++;
        continue;
      }
      if (isListItem(line)) break;
      const m = line.match(/^\s*([\w一-龥][\w一-龥\-]*)\s*:\s*(.*)$/);
      if (!m) {
        i++;
        continue;
      }
      const key = m[1];
      const rest = m[2].trim();
      i++;
      if (rest === "") {
        // could be nested mapping or list at greater indent
        if (i < lines.length) {
          const next = lines[i];
          const nextInd = indent(next);
          if (nextInd > ind) {
            if (isListItem(next)) obj[key] = parseList(nextInd);
            else obj[key] = parseBlock(nextInd);
            continue;
          }
        }
        obj[key] = "";
      } else {
        obj[key] = parseScalar(rest);
      }
    }
    return obj;
  }

  function parseList(baseIndent) {
    const arr = [];
    while (i < lines.length) {
      const line = lines[i];
      const ind = indent(line);
      if (ind < baseIndent) break;
      if (ind > baseIndent) {
        i++;
        continue;
      }
      if (!isListItem(line)) break;
      const m = line.match(/^\s*-\s+(.*)$/);
      if (!m) {
        i++;
        continue;
      }
      const rest = m[1].trim();
      i++;
      if (rest === "") {
        // nested mapping under this list item
        if (i < lines.length) {
          const next = lines[i];
          const nextInd = indent(next);
          if (nextInd > ind && isKv(next)) {
            arr.push(parseBlock(nextInd));
            continue;
          }
        }
        arr.push("");
        continue;
      }
      // could be "key: value" starting the mapping or a plain scalar
      const km = rest.match(/^([\w一-龥][\w一-龥\-]*)\s*:\s*(.*)$/);
      if (km) {
        const item = {};
        item[km[1]] = parseScalar(km[2]);
        // collect any further keys at the same deeper indent for this list item
        const itemIndent = ind + 2;
        while (i < lines.length) {
          const nl = lines[i];
          const nlInd = indent(nl);
          if (nlInd < itemIndent) break;
          if (nlInd > itemIndent) {
            i++;
            continue;
          }
          if (isListItem(nl)) break;
          const nm = nl.match(/^\s*([\w一-龥][\w一-龥\-]*)\s*:\s*(.*)$/);
          if (!nm) {
            i++;
            continue;
          }
          i++;
          if (nm[2].trim() === "") {
            if (i < lines.length) {
              const nn = lines[i];
              const nnInd = indent(nn);
              if (nnInd > nlInd) {
                if (isListItem(nn)) item[nm[1]] = parseList(nnInd);
                else item[nm[1]] = parseBlock(nnInd);
                continue;
              }
            }
            item[nm[1]] = "";
          } else {
            item[nm[1]] = parseScalar(nm[2]);
          }
        }
        arr.push(item);
      } else {
        arr.push(parseScalar(rest));
      }
    }
    return arr;
  }

  return parseBlock(0);
}

/**
 * Patch a YAML text in-place: only replace the *value* of known scalar keys,
 * and the *value* of known sub-keys inside `giscus`, `socials`,
 * `categorySlugs`, `categoryColors`, `tagColors`. Everything else (comments,
 * blank lines, ordering, indentation, quotes style) is preserved.
 *
 * `changes` is a flat mapping. Nested sub-keys use a dot-delimited path:
 *   "title"          → title: ...
 *   "giscus.repo"    → under giscus:, the line `  repo: ...`
 *   "socials.github" → under socials:, the line `  github: ...`
 *   "categorySlugs.前端开发" → under categorySlugs:, `  前端开发: ...`
 *
 * Returns the patched text. Unchanged lines are passed through verbatim.
 */
export function patchYamlText(text, changes) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  // Group changes by parent: scalar keys at root have parent = ""; nested
  // sub-keys (e.g. "giscus.repo") have parent = "giscus".
  const groups = {};
  for (const [path, newVal] of Object.entries(changes)) {
    const dot = path.indexOf(".");
    const parent = dot >= 0 ? path.slice(0, dot) : "";
    const key = dot >= 0 ? path.slice(dot + 1) : path;
    if (!groups[parent]) groups[parent] = {};
    groups[parent][key] = newVal;
  }

  let currentParent = "";
  let parentIndent = 0;

  for (let line of lines) {
    const trimmed = line.trim();
    const m = trimmed.match(/^([\w一-龥][\w一-龥\-]*)\s*:(.*)$/);
    if (m) {
      const key = m[1];
      const val = m[2];
      // Determine if this is a parent key (value empty = sub-block follows)
      if (!val.trim() || val.trim() === "|" || val.trim() === ">") {
        currentParent = key;
        parentIndent = line.search(/\S/);
      } else {
        // This is a "key: value" line.
        // Could be a top-level scalar or a sub-key of a parent.
        const effectiveParent = currentParent !== "" && line.trimLeft().startsWith(" ".repeat(parentIndent + 2))
          ? currentParent
          : "";
        const group = effectiveParent
          ? groups[effectiveParent]
          : groups[""];
        if (group && key in group) {
          const newValue = group[key];
          // Preserve original indentation and anything after "#" (comments).
          const indent = line.match(/^(\s*)/)[1];
          const comment = trimmed.includes("#") ? trimmed.replace(/^[^#]*/, "") : "";
          const quoted =
            val.trim().startsWith('"') || val.trim().startsWith("'");
          // If original was quoted, keep quoting; otherwise add quotes if needed.
          let outVal = newValue;
          if (quoted && !newValue.startsWith('"') && !newValue.startsWith("'")) {
            outVal = `"${newValue}"`;
          } else if (!quoted && /[:#"']/.test(newValue)) {
            outVal = `"${newValue}"`;
          }
          out.push(`${indent}${key}: ${outVal}${comment ? " " + comment.trimStart() : ""}`);
          continue;
        }
        // Not a key we track — reset parent tracking when it's a root-level key
        if (effectiveParent === "") {
          currentParent = key;
          parentIndent = line.search(/\S/);
        }
      }
    }
    out.push(line);
  }
  return out.join("\n");
}

export function dumpConfig(obj) {
  const lines = ["---"];
  const seen = new Set();
  const isPlainScalar = (v) =>
    v == null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean";
  const quote = (v) => {
    const s = String(v);
    if (/[:#\n"]/.test(s) || /^\s|\s$/.test(s)) return `"${s.replace(/"/g, '\\"')}"`;
    return s;
  };

  function dumpValue(v, indent) {
    const pad = " ".repeat(indent);
    if (v == null) return [`${pad}""`];
    if (Array.isArray(v)) {
      if (v.length === 0) return [`${pad}[]`];
      const out = [];
      for (const it of v) {
        if (it && typeof it === "object" && !Array.isArray(it)) {
          const entries = Object.entries(it);
          if (entries.length === 0) {
            out.push(`${pad}- {}`);
            continue;
          }
          const [k0, v0] = entries[0];
          if (isPlainScalar(v0)) {
            out.push(`${pad}- ${k0}: ${quote(v0)}`);
            for (let i = 1; i < entries.length; i++) {
              const [k, vv] = entries[i];
              if (isPlainScalar(vv)) {
                out.push(`${pad}  ${k}: ${quote(vv)}`);
              } else {
                out.push(`${pad}  ${k}:`);
                out.push(...dumpValue(vv, indent + 4));
              }
            }
          } else {
            out.push(`${pad}- ${k0}:`);
            out.push(...dumpValue(v0, indent + 4));
            for (let i = 1; i < entries.length; i++) {
              const [k, vv] = entries[i];
              if (isPlainScalar(vv)) {
                out.push(`${pad}  ${k}: ${quote(vv)}`);
              } else {
                out.push(`${pad}  ${k}:`);
                out.push(...dumpValue(vv, indent + 4));
              }
            }
          }
        } else {
          out.push(`${pad}- ${quote(it)}`);
        }
      }
      return out;
    }
    if (v && typeof v === "object") {
      const out = [];
      for (const [k, vv] of Object.entries(v)) {
        if (isPlainScalar(vv)) {
          out.push(`${pad}${k}: ${quote(vv)}`);
        } else {
          out.push(`${pad}${k}:`);
          out.push(...dumpValue(vv, indent + 2));
        }
      }
      return out.length ? out : [`${pad}{}`];
    }
    return [`${pad}${quote(v)}`];
  }

  for (const k of [
    "title",
    "description",
    "author",
    "language",
    "timezone",
    "url",
    "base",
    "theme",
    "comments",
    "reading_time",
    "toc",
    "license",
    "favicon",
    "icp",
    "moe",
    "copyright",
    "footerLinks",
    "showBuildInfo",
  ]) {
    if (k in obj) {
      if (isPlainScalar(obj[k])) {
        lines.push(`${k}: ${quote(obj[k])}`);
      } else {
        lines.push(`${k}:`);
        lines.push(...dumpValue(obj[k], 2));
      }
      seen.add(k);
    }
  }
  for (const k of ["giscus", "socials", "categorySlugs", "categoryColors", "tagColors"]) {
    if (k in obj) {
      lines.push(`${k}:`);
      lines.push(...dumpValue(obj[k], 2));
      seen.add(k);
    }
  }
  for (const k of ["navigation", "menu"]) {
    if (k in obj) {
      lines.push(`${k}:`);
      lines.push(...dumpValue(obj[k], 2));
      seen.add(k);
    }
  }
  for (const k of Object.keys(obj)) {
    if (seen.has(k)) continue;
    if (isPlainScalar(obj[k])) {
      lines.push(`${k}: ${quote(obj[k])}`);
    } else {
      lines.push(`${k}:`);
      lines.push(...dumpValue(obj[k], 2));
    }
  }
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}
