/**
 * The materials of the deep-sky catalogues' markers (scene/DeepSky.tsx; shaders/deepSkyMarker.vert.glsl,
 * deepSkyGalaxy.vert.glsl, gwRegion.vert.glsl). Part of the deep-sky chunk, loaded with the scene's layer: the shared
 * uniforms (relativity, the pixel ratio, the expanding sky's) come from render/materials.ts by reference, so the
 * frame's updates reach these too. All are added light over the stars and under the bodies, with no depth test, like
 * the planet-host rings: guides, not things in space.
 */
import { AdditiveBlending, Color, Matrix3, ShaderMaterial, Vector2, Vector3 } from 'three';
import { psfUniforms, relativityUniforms, skyUniforms } from './materials';
import markerVert from './shaders/deepSkyMarker.vert.glsl?raw';
import galaxyVert from './shaders/deepSkyGalaxy.vert.glsl?raw';
import regionVert from './shaders/gwRegion.vert.glsl?raw';

/** The markers' colours by style (sim/deepsky/markers.ts STYLE): clusters blue-white, nebulae lilac, planetary nebulae teal, remnants amber, pulsars cyan, galaxies warm white, magnetars magenta. */
export const MARKER_COLOURS = ['#9fb8ff', '#ffd9a8', '#c9a2d8', '#86d8c0', '#ffae7a', '#8fe4ff', '#e6d8bd', '#ff8fe0'] as const;
/** How strongly a marker shows at full (they are guides: kept faint). */
export const MARKER_OPACITY = 0.55;
/** The merger regions' colours: black holes violet, a black hole and a neutron star blue, neutron stars rose. */
export const REGION_COLOURS = ['#b39dff', '#8fb6ff', '#ff9fb8'] as const;

const MARKER_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uColors[8];
varying float vAlpha;
varying float vRing;
varying float vStyle;
varying float vPulse;
varying float vSelected;
void main() {
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float w = fwidth(r);
  int style = int(vStyle + 0.5);
  float shape;
  if (style == 5) {
    // A pulsar: a small soft dot that beats with its spin.
    shape = exp(-6.0 * r * r) * vPulse;
  } else if (style == 7) {
    // A magnetar: a dot in a faint ring, beating with its spin.
    shape = exp(-6.0 * r * r) * vPulse + 0.5 * smoothstep(vRing - 2.0 * w, vRing - w, r) * (1.0 - smoothstep(vRing, vRing + w, r));
  } else if (style == 3) {
    // A planetary nebula: a dot in a ring.
    shape = 0.8 * exp(-10.0 * r * r) + 0.6 * smoothstep(vRing - 2.0 * w, vRing - w, r) * (1.0 - smoothstep(vRing, vRing + w, r));
  } else {
    // Clusters, nebulae, remnants and galaxies: a thin ring of the object's size.
    shape = smoothstep(vRing - 2.0 * w, vRing - w, r) * (1.0 - smoothstep(vRing, vRing + w, r));
  }
  float a = shape * vAlpha * (vSelected > 0.5 ? 1.6 : 1.0);
  if (a <= 0.002) discard;
  gl_FragColor = vec4(uColors[style] * a, 1.0);
}
`;

const REGION_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uColors[3];
varying float vAlpha;
varying float vKind;
varying float vSelected;
void main() {
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r >= 1.0) discard;
  // A soft disc; the selected region's edge reads a little, to show how far it reaches.
  float edge = vSelected > 0.5 ? 0.25 * smoothstep(0.7, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r)) : 0.0;
  float a = vAlpha * (exp(-3.0 * r * r) * (1.0 - smoothstep(0.85, 1.0, r)) + edge);
  if (a <= 0.001) discard;
  gl_FragColor = vec4(uColors[int(vKind + 0.5)] * a, 1.0);
}
`;

const colours = (list: readonly string[]) => list.map((c) => new Color(c));

const shared = () => ({ ...relativityUniforms, uPixelRatio: psfUniforms.uPixelRatio });

function additive(uniforms: Record<string, { value: unknown }>, vertexShader: string, fragmentShader: string): ShaderMaterial {
  return new ShaderMaterial({ uniforms, vertexShader, fragmentShader, blending: AdditiveBlending, depthTest: false, depthWrite: false, transparent: false });
}

/** One galactic catalogue's markers (each catalogue its own material: its own selection and fade). */
export function createDeepSkyMarkerMaterial(): ShaderMaterial {
  return additive(
    {
      ...shared(),
      uCamHi: { value: new Vector3() },
      uCamLo: { value: new Vector3() },
      uGalToWorld: { value: new Matrix3() },
      uPxPerRad: { value: 1 },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uSelected: { value: -1 },
      uHidden: { value: new Vector2(-1, -1) },
      uSelectedRel: { value: new Vector3() },
      uColors: { value: colours(MARKER_COLOURS) },
    },
    markerVert,
    MARKER_FRAG,
  );
}

/** The NGC/IC galaxies' rings (their shader takes the expanding sky's uniforms and its emission lookup: withEmission). */
export function createDeepSkyGalaxyMaterial(): ShaderMaterial {
  return additive(
    {
      ...shared(),
      ...skyUniforms,
      uCamHi: { value: new Vector3() },
      uCamLo: { value: new Vector3() },
      uPxPerRad: { value: 1 },
      uOpacity: { value: 0 },
      uSelected: { value: -1 },
      uColors: { value: colours(MARKER_COLOURS) },
    },
    galaxyVert,
    MARKER_FRAG,
  );
}

/** The merger regions. */
export function createGwRegionMaterial(sprites: number): ShaderMaterial {
  return additive(
    {
      ...shared(),
      ...skyUniforms,
      uCamHi: { value: new Vector3() },
      uCamLo: { value: new Vector3() },
      uPxPerRad: { value: 1 },
      uOpacity: { value: 0 },
      uSelected: { value: -1 },
      uSprites: { value: sprites },
      uColors: { value: colours(REGION_COLOURS) },
    },
    regionVert,
    REGION_FRAG,
  );
}

/** The unprocessed vertex shaders, for the emission lookup's swap (render/materials.ts withEmission). */
export const DEEP_SKY_GALAXY_VERT = galaxyVert;
export const GW_REGION_VERT = regionVert;
