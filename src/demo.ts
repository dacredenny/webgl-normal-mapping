import "./scss/index.scss";
import { mat4, vec3 } from "gl-matrix";
import Shader from "./webgl/shader";
import * as textures from "./webgl/texture";
import * as geometry from "./webgl/geometry";
import * as clock from "./clock";
import Camera from "./webgl/camera";

let time = 0;

const camera = new Camera();
camera.setPosition(1, 2, 5);
camera.setLookAt(0, 0, 0);

function getLights(count: number) {
  return [
    {
      position: vec3.create(),
      color: vec3.fromValues(0.85, 0.95, 1),
      range: 0.25
    },
    {
      position: vec3.create(),
      color: vec3.fromValues(0.35, 0.95, 1),
      range: 1.0
    },
    {
      position: vec3.create(),
      color: vec3.fromValues(0.85, 0.45, 0.4),
      range: 0.5
    },
    {
      position: vec3.create(),
      color: vec3.fromValues(0.85, 0.4, 0.45),
      range: 0.5
    },
    {
      position: vec3.create(),
      color: vec3.fromValues(0.45, 0.85, 0.4),
      range: 1.5
    }
  ].slice(0, count)
}

const ambient = vec3.fromValues(0.1, 0.1, 0.1);
let lights: any[] = [];

let axisGeometry: any
let lightGeometry: any
let objectGeometry: any;

let textureColor: WebGLTexture
let textureNormal: WebGLTexture;

let normalShader: Shader
let wireframeShader: Shader;

let gl: WebGLRenderingContext

function renderLights() {

  if (!wireframeShader || !lightGeometry) return

  wireframeShader.use(gl);

  wireframeShader.updateUniforms(gl, {
    uProjectionMatrix: camera.getProjection(),
    uViewMatrix: camera.getView()
  });

  for (var i = 0; i < lights.length; i++) {

    const phase = time + 2.0 * Math.PI * (i / lights.length)
    const light = lights[i]

    vec3.set(
      light.position,
      Math.sin(phase) * 2,
      Math.sin(phase + time + i * 1.33) * 2,
      Math.cos(phase) * 2
    );

    const lightTranslation = mat4.create();
    mat4.fromTranslation(lightTranslation, light.position);

    wireframeShader.updateUniforms(gl, {
      uWorldMatrix: lightTranslation
    });

    geometry.bindBufferAndProgram(gl, wireframeShader, lightGeometry);
    geometry.drawBuffer(gl, lightGeometry, gl.LINES);
  }
}

function renderAxis() {

  if (!axisGeometry || !wireframeShader) return

  wireframeShader.use(gl)

  wireframeShader.updateUniforms(gl, {
    uProjectionMatrix: camera.getProjection(),
    uViewMatrix: camera.getView(),
    uWorldMatrix: mat4.create()
  })

  geometry.bindBufferAndProgram(gl, wireframeShader, axisGeometry);

  geometry.drawBuffer(gl, axisGeometry, gl.LINES);
}

function applyWindowSize() {
  camera.setAspectRatio(document.body.clientWidth / document.body.clientHeight);
}

function renderObject(normalScale: number) {

  if (!normalShader || !objectGeometry) return

  const rotationMatrix = mat4.fromZRotation(mat4.create(), time);

  const translationMatrix = mat4.fromTranslation(mat4.create(), [
    0,
    Math.sin(time),
    0
  ]);

  const worldMatrix = mat4.multiply(
    mat4.create(),
    translationMatrix,
    rotationMatrix
  );

  normalShader.use(gl);

  normalShader.updateUniforms(gl, {
    normalScale: normalScale,
    lights: lights,
    uTextureNormal: textureNormal,
    uTextureColor: textureColor,
    uProjectionMatrix: camera.getProjection(),
    uViewMatrix: camera.getView(),
    uViewPosition: camera.getPosition(),
    uWorldMatrix: worldMatrix,
    ambient: ambient
  });

  geometry.bindBufferAndProgram(gl, normalShader, objectGeometry);

  geometry.drawBuffer(gl, objectGeometry);
}

export async function loadAssets(controls: {
  geometry: string,
  lights: number
}) {

  textureColor = await textures.loadTexture(
    gl,
    "./textures/EC_Stone_Wall_D.jpg"
  );
  textureNormal = await textures.loadTexture(
    gl,
    "./textures/EC_Stone_Wall_Normal.jpg"
  );

  lights = getLights(controls.lights)

  normalShader = await Shader.create(
    gl,
    "./shaders/normal.vs",
    "./shaders/normal.fs",
    ["LIGHTS " + lights.length]
  );

  wireframeShader = await Shader.create(
    gl,
    "./shaders/simple.vs",
    "./shaders/simple.fs"
  );

  normalShader.use(gl)
  normalShader.updateUniforms(gl, {
    normalScale: 0.5
  })

  axisGeometry = geometry.createAxis(gl);

  lightGeometry = geometry.createLight(gl, 0.5);

  await setGeometry(controls.geometry)
}

export async function create(canvas: HTMLCanvasElement) {

  gl = canvas.getContext("webgl") as WebGLRenderingContext;
  if (!gl) {
    throw new Error("Unable to initialize WebGL. Your browser or machine may not support it.")
  }

  canvas.addEventListener("contextmenu", event => event.preventDefault());

  canvas.addEventListener("mousewheel", (event: MouseWheelEvent) => {
    const vector = camera.getForward();
    vec3.scale(vector, vector, event.wheelDelta * 0.005);
    vec3.add(vector, vector, camera.getPosition());
    camera.setPosition(vector[0], vector[1], vector[2]);
  });

  canvas.addEventListener("mousemove", (event: MouseEvent) => {
    if (event.buttons > 0) {

      const dx = event.movementX / document.body.clientWidth;
      const position = vec3.rotateY(
        vec3.create(),
        camera.getPosition(),
        camera.getLookAt(),
        dx * 30
      );
      camera.setPosition(position[0], position[1], position[2]);
    }
  });

  window.addEventListener("resize", () => {
    applyWindowSize();
  });

  applyWindowSize()
}

export function release() {

}

export function render(controls: {
  normal: number,
  speed: number
}) {

  if (!gl) return

  gl.clearColor(ambient[0], ambient[1], ambient[2], 1.0);
  gl.clearDepth(1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  renderObject(controls.normal);

  renderLights();

  renderAxis();

  time += clock.update() * controls.speed;
}

export async function setGeometry(geometryType: string) {

  const response = await fetch(`./geom/${geometryType}.json`)
  const json = await response.json()

  objectGeometry = geometry.loadGeometry(gl, json);
}

export function setLightCount(count: number) {

  return Shader.create(
    gl,
    "./shaders/normal.vs",
    "./shaders/normal.fs",
    ["LIGHTS " + count]
  ).then(shader => {

    lights = getLights(count)

    normalShader.release(gl)
    normalShader = shader

  });
}