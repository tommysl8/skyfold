/**
 * A star's convection pattern baked into a small cube map (shaders/starCells.frag.glsl), which its close-up disc
 * samples (shaders/starSurface.frag.glsl). Evaluating the cells for every pixel of a disc filling the screen cost
 * about 20 ms a frame on the target laptop; baking one 256² face a frame costs a fraction of a millisecond, and each
 * face is redrawn every six frames, often enough for cells that turn over in tens of seconds as shown.
 *
 * Made only while a star's disc is large on screen (scene/Bodies.tsx StarBody), and disposed with it. Granules finer
 * than the map can hold (a Sun-like star's millions) are left out of it; their contrast is then zero (closeup.ts says
 * the disc fades them below a couple of pixels anyway).
 */
import { LinearFilter, LinearMipmapLinearFilter, Mesh, OrthographicCamera, PlaneGeometry, RGBAFormat, Scene, WebGLCubeRenderTarget, type ShaderMaterial, type WebGLRenderer } from 'three';
import { createStarCellsMaterial } from './materials';

/** Texels a face. */
export const CELL_FACE = 256;
/** The finest pattern the map holds: cells per unit of direction at four texels a cell (a face spans 2 units). */
export const CELL_MAX_FREQ = CELL_FACE / 2 / 4;

export class StarCells {
  readonly target = new WebGLCubeRenderTarget(CELL_FACE, {
    format: RGBAFormat,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  });
  private readonly material: ShaderMaterial = createStarCellsMaterial();
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad = new Mesh(new PlaneGeometry(2, 2), this.material);
  private face = 0;
  /** Faces drawn so far: the map is usable once all six are. */
  private drawn = 0;

  constructor(granFreq: number, giantFreq: number) {
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const u = this.material.uniforms;
    u.uSize.value = CELL_FACE;
    u.uGranFreq.value = granFreq <= CELL_MAX_FREQ ? granFreq : 0;
    u.uGiantFreq.value = giantFreq;
  }

  /** Whether granules of this frequency are in the map. */
  static holds(granFreq: number): boolean {
    return granFreq > 0 && granFreq <= CELL_MAX_FREQ;
  }

  get ready(): boolean {
    return this.drawn >= 6;
  }

  /** Draw the next face (all six at once the first time) at the surface's time, in turnovers. */
  update(gl: WebGLRenderer, time: number): void {
    const prev = gl.getRenderTarget();
    const prevFace = gl.getActiveCubeFace();
    const prevMip = gl.getActiveMipmapLevel();
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    this.material.uniforms.uTime.value = time;
    const n = this.ready ? 1 : 6;
    for (let i = 0; i < n; i++) {
      this.material.uniforms.uFace.value = this.face;
      gl.setRenderTarget(this.target, this.face);
      gl.render(this.scene, this.camera);
      this.face = (this.face + 1) % 6;
      this.drawn++;
    }
    gl.setRenderTarget(prev, prevFace, prevMip);
    gl.autoClear = autoClear;
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
