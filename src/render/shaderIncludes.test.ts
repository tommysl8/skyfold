/**
 * Every shader the app compiles, expanded through its #includes as three.js expands them (as text, with no
 * include guards: WebGLProgram's resolveIncludes), run through the preprocessor with its material's defines,
 * after the declarations three.js's ShaderMaterial prefix makes: no uniform, global variable, const, struct or
 * function (by signature) may be declared twice. Materials whose source has a LENS branch are also expanded
 * with LENS, and with LENS and LENS_EXACT, defined. A shader that fails this fails to link in the browser, and
 * nothing else in Node would notice: no test compiles GLSL.
 *
 * The lens chunk (shaders/lens.glsl), the accretion flow's chunk (shaders/flowLookup.glsl) and the thin disc's
 * (shaders/diskLookup.glsl) include nothing and declare exactly the uniforms of their shared objects
 * (render/lens/lensUniforms.ts, render/flow/flowMap.ts, render/disk/diskMap.ts);
 * the lens chunk calls no acos, asin or built-in atan (this GPU's are inaccurate: its atan is the
 * Abramowitz–Stegun polynomial, atan(1e-3, 1)·1e3 = 0.999866 measured in Chrome on the target laptop).
 */
import { describe, expect, it } from 'vitest';
import { Color, ShaderChunk, type ShaderMaterial } from 'three';
import * as materials from './materials';
import { LATER_MATERIALS } from './precompile';
import { galaxyLayer } from './galaxyLayer';
import { createGalacticFieldMaterial, createGalacticFieldSkyMaterial } from './galacticFieldMaterials';
import { lensUniforms } from './lens/lensUniforms';
import { flowUniforms } from './flow/flowMap';
import { diskUniforms } from './disk/diskMap';
import remapVert from './shaders/remap.vert.glsl?raw';
import remapFrag from './shaders/remap.frag.glsl?raw';
import lensGlsl from './shaders/lens.glsl?raw';
import flowLookupGlsl from './shaders/flowLookup.glsl?raw';
import diskLookupGlsl from './shaders/diskLookup.glsl?raw';

// ─── A small GLSL front end: includes, comments, the preprocessor, top-level declarations ───────

const chunks = ShaderChunk as unknown as Record<string, string>;

/** three.js's include expansion: text, recursively, no guards. */
function resolveIncludes(src: string): string {
  return src.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (_, name: string) => {
    const chunk = chunks[name];
    if (chunk === undefined) throw new Error(`cannot resolve #include <${name}>`);
    return resolveIncludes(chunk);
  });
}

/** Comments out, keeping the lines where they were. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** The value of a #if or #elif expression: defined(), numeric macros, and C's operators. */
function evalIf(expr: string, defs: Map<string, string>): boolean {
  let e = expr.replace(/defined\s*\(\s*(\w+)\s*\)|defined\s+(\w+)/g, (_, a?: string, b?: string) => (defs.has((a ?? b) as string) ? '1' : '0'));
  e = e.replace(/\b[A-Za-z_]\w*\b/g, (n) => {
    const v = defs.get(n);
    return v !== undefined && /^[-+]?[0-9.]+(e[-+]?[0-9]+)?$/i.test(v) ? v : '0';
  });
  if (!/^[\s0-9.eE+\-*/%()!<>=&|]*$/.test(e)) throw new Error(`cannot evaluate #if ${expr}`);
  return !!Function(`"use strict"; return (${e});`)();
}

/** The GLSL preprocessor's conditionals and defines; every other directive is dropped. */
function preprocess(src: string, initial: Map<string, string>): string {
  const defs = new Map(initial);
  const out: string[] = [];
  const stack: { active: boolean; taken: boolean }[] = [];
  const outerActive = () => stack.slice(0, -1).every((s) => s.active);
  for (const line of src.replace(/\\\r?\n/g, ' ').split(/\r?\n/)) {
    const m = /^\s*#\s*(\w+)\s*(.*)$/.exec(line);
    const active = stack.every((s) => s.active);
    if (!m) {
      if (active) out.push(line);
      continue;
    }
    const [, dir, rest] = m;
    const name = rest.trim().split(/[\s(]/)[0];
    if (dir === 'ifdef' || dir === 'ifndef' || dir === 'if') {
      const on = active && (dir === 'if' ? evalIf(rest, defs) : defs.has(name) === (dir === 'ifdef'));
      stack.push({ active: on, taken: on });
    } else if (dir === 'elif' || dir === 'else') {
      const top = stack[stack.length - 1];
      if (!top) throw new Error(`#${dir} without #if`);
      top.active = outerActive() && !top.taken && (dir === 'else' || evalIf(rest, defs));
      top.taken ||= top.active;
    } else if (dir === 'endif') {
      if (!stack.pop()) throw new Error('#endif without #if');
    } else if (active && dir === 'define') {
      const d = /^(\w+)(\([^)]*\))?\s*(.*)$/.exec(rest.trim());
      if (d) defs.set(d[1], d[2] ? '' : d[3].trim());
    } else if (active && dir === 'undef') defs.delete(name);
  }
  if (stack.length) throw new Error('#if without #endif');
  return out.join('\n');
}

/** The statements at file scope: declarations ending in ';', and definitions ending in their closing brace. */
function topLevel(src: string): string[] {
  const out: string[] = [];
  let brace = 0;
  let paren = 0;
  let cur = '';
  for (const ch of src) {
    cur += ch;
    if (ch === '(') paren++;
    else if (ch === ')') paren--;
    else if (ch === '{') brace++;
    else if (ch === '}') {
      brace--;
      // A struct's declaration goes on to its semicolon.
      if (brace === 0 && paren === 0 && !/^\s*struct\b/.test(cur)) {
        out.push(cur);
        cur = '';
      }
    } else if (ch === ';' && brace === 0 && paren === 0) {
      out.push(cur);
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s !== '' && s !== ';');
}

const QUALIFIERS = new Set(['const', 'in', 'out', 'inout', 'highp', 'mediump', 'lowp', 'precise', 'invariant', 'flat', 'smooth', 'centroid']);

/** A function's key: its name and its parameters' types (GLSL overloads by type). */
function signature(name: string, params: string): string {
  const types = params
    .split(',')
    .map((p) => p.replace(/\[[^\]]*\]/g, '[]').trim().split(/\s+/).filter((t) => !QUALIFIERS.has(t)))
    .filter((t) => t.length > 0 && t[0] !== 'void')
    .map((t) => t[0] + (t.join(' ').includes('[]') ? '[]' : ''));
  return `${name}(${types.join(',')})`;
}

/** What a shader declares at file scope: variables (uniforms, attributes, varyings, consts, globals), structs, functions. */
function declarations(src: string): { vars: string[]; structs: string[]; fns: string[] } {
  const vars: string[] = [];
  const structs: string[] = [];
  const fns: string[] = [];
  for (const s of topLevel(src)) {
    const brace = s.indexOf('{');
    const struct = /^struct\s+(\w+)/.exec(s);
    if (struct) {
      structs.push(struct[1]);
      continue;
    }
    if (brace >= 0) {
      const f = /(\w+)\s*\(([^)]*)\)\s*$/.exec(s.slice(0, brace).trim());
      if (f) fns.push(signature(f[1], f[2]));
      continue;
    }
    const body = s.replace(/;$/, '').replace(/^layout\s*\([^)]*\)\s*/, '');
    if (/^precision\b/.test(body)) continue;
    const eq = body.indexOf('=');
    const open = body.indexOf('(');
    if (open >= 0 && (eq < 0 || open < eq)) continue; // a function's prototype
    const parts = (eq >= 0 ? body.slice(0, eq) : body).replace(/\[[^\]]*\]/g, ' ').split(',');
    const first = parts[0].trim().split(/\s+/);
    if (first.length < 2) continue;
    vars.push(first[first.length - 1]);
    for (const p of parts.slice(1)) {
      const n = p.trim().split(/\s+/)[0];
      if (n) vars.push(n);
    }
  }
  return { vars, structs, fns };
}

/** What three.js's ShaderMaterial prefix declares before the shader (WebGLProgram, r186). */
const VERTEX_PREFIX = `
uniform mat4 modelMatrix; uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix; uniform mat4 viewMatrix;
uniform mat3 normalMatrix; uniform vec3 cameraPosition; uniform bool isOrthographic;
attribute vec3 position; attribute vec3 normal; attribute vec2 uv;
`;
const FRAGMENT_PREFIX = `
uniform mat4 viewMatrix; uniform vec3 cameraPosition; uniform bool isOrthographic;
${chunks.colorspace_pars_fragment}
vec4 linearToOutputTexel( vec4 value ) { return value; }
float luminance( const in vec3 rgb ) { return 0.0; }
`;
/** Defines three.js adds for the app's renderer (logarithmicDepthBuffer: true, highp). */
const RENDERER_DEFINES: [string, string][] = [
  ['USE_LOGARITHMIC_DEPTH_BUFFER', ''],
  ['HIGH_PRECISION', ''],
];

/** Names declared more than once in one stage of one program. */
function duplicates(stage: 'vertex' | 'fragment', source: string, defines: Record<string, unknown>): string[] {
  const defs = new Map<string, string>(RENDERER_DEFINES);
  for (const [k, v] of Object.entries(defines)) defs.set(k, v === true ? '' : String(v ?? ''));
  const text = preprocess(stripComments((stage === 'vertex' ? VERTEX_PREFIX : FRAGMENT_PREFIX) + resolveIncludes(source)), defs);
  const d = declarations(text);
  const twice = (list: string[]) => [...new Set(list.filter((n, i) => list.indexOf(n) !== i))];
  return [...twice(d.vars).map((n) => `variable ${n}`), ...twice(d.structs).map((n) => `struct ${n}`), ...twice(d.fns).map((n) => `function ${n}`)];
}

// ─── Every program the app compiles ──────────────────────────────────────────────────────────

interface Program {
  name: string;
  vertex: string;
  fragment: string;
  defines: Record<string, unknown>;
}

/** Arguments for the factories that need them. */
const ARGS: Record<string, unknown[]> = {
  createOrbitMaterial: [new Color(1, 1, 1)],
  createPlanetMaterial: [{ baseColor: new Color(1, 1, 1) }],
  createGalaxyMaterial: [1, 0],
};

function programOf(name: string, m: ShaderMaterial): Program {
  return { name, vertex: m.vertexShader, fragment: m.fragmentShader, defines: { ...(m.defines ?? {}) } };
}

/** Every material factory of render/materials.ts, the background compiles (the lens's included), the Galaxy layer's composite, the magnetic field's and the relativistic remap. */
function allPrograms(): { programs: Program[]; problems: string[] } {
  const programs: Program[] = [];
  const problems: string[] = [];
  for (const [name, make] of Object.entries(materials)) {
    if (!/^create\w*Material$/.test(name) || typeof make !== 'function') continue;
    const args = ARGS[name] ?? [];
    if (make.length > args.length) {
      problems.push(`${name} needs arguments: add them to ARGS in shaderIncludes.test.ts`);
      continue;
    }
    programs.push(programOf(name, (make as (...a: unknown[]) => ShaderMaterial)(...args)));
  }
  LATER_MATERIALS.forEach(([make], i) => programs.push(programOf(`LATER_MATERIALS[${i}]`, make())));
  programs.push(programOf('galaxyLayer.composite', galaxyLayer.composite));
  // The magnetic field's chunk (scene/GalacticField.tsx).
  programs.push(programOf('createGalacticFieldMaterial', createGalacticFieldMaterial()));
  programs.push(programOf('createGalacticFieldSkyMaterial', createGalacticFieldSkyMaterial()));
  programs.push({ name: 'remap', vertex: remapVert, fragment: remapFrag, defines: {} });
  return { programs, problems };
}

/** Its own defines; with LENS, and LENS and LENS_EXACT, too when its source has such a branch. */
function configurations(p: Program): Record<string, unknown>[] {
  const out = [p.defines];
  const src = resolveIncludes(p.vertex) + resolveIncludes(p.fragment);
  if (/^\s*#\s*(if|ifdef|ifndef|elif)\b[^\n]*\bLENS(_EXACT)?\b/m.test(src)) {
    out.push({ ...p.defines, LENS: '' }, { ...p.defines, LENS: '', LENS_EXACT: '' });
  }
  return out;
}

// ─── The tests ───────────────────────────────────────────────────────────────────────────────

describe('the declaration check', () => {
  it('finds a chunk included twice, a const, a function and a struct declared twice', () => {
    expect(duplicates('vertex', '#include <lightspeed_relativity>\n#include <lightspeed_relativity>\nvoid main() {}', {})).toEqual(
      expect.arrayContaining(['variable uPhi', 'variable uVelDir', 'function relAberrate(vec3,float)']),
    );
    const src = 'const float K = 1.0;\nconst float K = 2.0;\nstruct S { float a; };\nstruct S { float a; };\nfloat f(float x) { return x; }\nfloat f(float y) { return y; }\nvoid main() {}';
    expect(duplicates('fragment', src, {})).toEqual(['variable K', 'struct S', 'function f(float)']);
  });

  it("reads the app's own shaders: the star shader's uniforms, attributes and functions", () => {
    const m = materials.createStarMaterial();
    const d = declarations(preprocess(stripComments(VERTEX_PREFIX + resolveIncludes(m.vertexShader)), new Map(RENDERER_DEFINES)));
    expect(d.vars).toEqual(expect.arrayContaining(['uPhi', 'uCamHi', 'uMagLimit', 'position', 'vFragDepth']));
    expect(d.fns).toEqual(expect.arrayContaining(['relAberrate(vec3,float)', 'dopplerMagnitudeShift(float,float,vec3)', 'main()']));
  });

  it('allows overloads, locals of the same name, prototypes and the branches not taken', () => {
    const src = [
      'float f(float x);',
      'float f(float x) { const float k = 1.0; return x * k; }',
      'vec3 f(vec3 x) { const float k = 2.0; return x * k; }',
      '#ifdef LENS',
      'uniform float uA;',
      '#else',
      'uniform float uA;',
      '#endif',
      '#if defined( LENS ) && defined( LENS_EXACT )',
      'uniform float uA;',
      '#endif',
      'void main() {}',
    ].join('\n');
    expect(duplicates('vertex', src, {})).toEqual([]);
    expect(duplicates('vertex', src, { LENS: '' })).toEqual([]);
    expect(duplicates('vertex', src, { LENS: '', LENS_EXACT: '' })).toEqual(['variable uA']);
  });
});

describe('every shader the app compiles', () => {
  it('declares each uniform, variable, const, struct and function once, through its includes', () => {
    const { programs, problems } = allPrograms();
    expect(programs.length).toBeGreaterThanOrEqual(24);
    for (const p of programs) {
      for (const defines of configurations(p)) {
        const tag = `${p.name}${Object.keys(defines).length ? ` [${Object.keys(defines).join(', ')}]` : ''}`;
        for (const d of duplicates('vertex', p.vertex, defines)) problems.push(`${tag} vertex: ${d} declared twice`);
        for (const d of duplicates('fragment', p.fragment, defines)) problems.push(`${tag} fragment: ${d} declared twice`);
      }
    }
    expect(problems).toEqual([]);
  });
});

/**
 * GLSL ES 3.00's reserved words (section 3.7; three.js compiles every shader as 3.00): a shader that names a
 * variable or a parameter with one fails to compile in the browser (a lens parameter named `flat` did, once).
 * The interpolation qualifiers are keywords: they may only qualify.
 */
const RESERVED = new Set(
  (
    'attribute varying coherent volatile restrict readonly writeonly resource atomic_uint noperspective patch sample subroutine ' +
    'common partition active asm class union enum typedef template this goto inline noinline public static extern external ' +
    'interface long short double half fixed unsigned superp input output hvec2 hvec3 hvec4 dvec2 dvec3 dvec4 fvec2 fvec3 ' +
    'fvec4 sampler3DRect filter sizeof cast namespace using'
  )
    .split(' ')
    // attribute and varying are three.js's own macros for in and out.
    .filter((w) => w !== 'attribute' && w !== 'varying'),
);

/** Reserved words used as names in a shader's expanded text. */
function reservedNames(stage: 'vertex' | 'fragment', source: string, defines: Record<string, unknown>): string[] {
  const defs = new Map<string, string>(RENDERER_DEFINES);
  for (const [k, v] of Object.entries(defines)) defs.set(k, v === true ? '' : String(v ?? ''));
  const text = preprocess(stripComments(resolveIncludes(source)), defs);
  const found = new Set<string>();
  for (const m of text.matchAll(/\b[A-Za-z_]\w*\b/g)) if (RESERVED.has(m[0])) found.add(m[0]);
  for (const m of text.matchAll(/\b(flat|smooth|centroid)\b(?!\s+(?:varying|in|out|centroid|flat|smooth|highp|mediump|lowp)\b)/g)) found.add(m[1]);
  void stage;
  return [...found];
}

describe('names in the shaders', () => {
  it('finds a reserved word used as a name', () => {
    expect(reservedNames('fragment', 'bool f(bool flat) { return flat; }\nvoid main() { float sample = 1.0; }', {}).sort()).toEqual(['flat', 'sample']);
    expect(reservedNames('fragment', 'flat varying float v;\nvoid main() {}', {})).toEqual([]);
  });

  it('never uses a reserved word of GLSL ES 3.00 as a name, in any program the app compiles', () => {
    const { programs } = allPrograms();
    const problems: string[] = [];
    for (const p of programs) {
      for (const defines of configurations(p)) {
        for (const w of reservedNames('vertex', p.vertex, defines)) problems.push(`${p.name} vertex: ${w}`);
        for (const w of reservedNames('fragment', p.fragment, defines)) problems.push(`${p.name} fragment: ${w}`);
      }
    }
    expect([...new Set(problems)]).toEqual([]);
  });
});

describe('the lens, flow and disc chunks', () => {
  it('include nothing', () => {
    expect(stripComments(lensGlsl)).not.toMatch(/^\s*#\s*include/m);
    expect(stripComments(flowLookupGlsl)).not.toMatch(/^\s*#\s*include/m);
    expect(stripComments(diskLookupGlsl)).not.toMatch(/^\s*#\s*include/m);
  });

  it('the disc reads its tables only with texelFetch, and its noise with textureLod (the band calls it in a loop)', () => {
    const code = stripComments(diskLookupGlsl);
    expect(code).not.toMatch(/\btexture(2D)?\s*\(/);
    expect(code).toMatch(/texelFetch\(uDiskOrbit/);
  });

  it('never call acos, asin or the built-in atan in the lens', () => {
    const code = stripComments(lensGlsl);
    expect(code).not.toMatch(/\bacos\s*\(/);
    expect(code).not.toMatch(/\basin\s*\(/);
    expect(code).not.toMatch(/\batan\s*\(/);
  });

  it('declare exactly the uniforms of their shared objects', () => {
    const uniformsOf = (src: string) => [...stripComments(src).matchAll(/^\s*uniform\s+(?:(?:lowp|mediump|highp)\s+)?\w+\s+(\w+)/gm)].map((m) => m[1]).sort();
    expect(uniformsOf(lensGlsl)).toEqual(Object.keys(lensUniforms).sort());
    expect(uniformsOf(flowLookupGlsl)).toEqual(Object.keys(flowUniforms).sort());
    expect(uniformsOf(diskLookupGlsl)).toEqual(Object.keys(diskUniforms).sort());
  });
});
