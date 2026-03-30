import { useRef, useEffect } from 'react';

interface BackgroundShaderProps {
  progress: number;
  active: boolean;
}

const VERTEX_SHADER = `attribute vec2 a;
void main(){ gl_Position = vec4(a,0,1); }`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform float t;
uniform vec2 r;
uniform vec3 c0, c1, c2, c3, c4, c5;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f *= f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}

float sn(vec2 p) {
  return vn(p) * 0.6 + vn(p * 2.1 + 3.7) * 0.4;
}

vec3 grad4(float y) {
  vec3 a = mix(c3, c2, smoothstep(0.0, 0.35, y));
  vec3 b = mix(a, c1, smoothstep(0.35, 0.65, y));
  return mix(b, c0, smoothstep(0.65, 1.0, y));
}

void main() {
  vec2 uv = gl_FragCoord.xy / r;
  float ax = uv.x * r.x / r.y;
  float s = t * 0.7;

  float sy3 = sin(uv.y * 3.0 + s * 0.7);
  float cy2 = cos(ax * 2.5 + s * 0.6);

  vec2 w = uv;
  w.x += sy3 * 0.22 + sin(uv.y * 5.5 + s * 1.1 + uv.x * 2.0) * 0.12;
  w.y += cy2 * 0.18 + cos(ax * 4.0 + s * 0.9 + uv.y * 3.0) * 0.10;

  vec2 d1 = vec2(cos(s * 0.3), sin(s * 0.25)) * 3.0;
  vec2 d2 = vec2(sin(s * 0.2 + 2.0), cos(s * 0.35)) * 2.5;

  float wx = w.x * r.x / r.y;
  float n1 = sn(vec2(wx, w.y) * 2.0 + d1);
  float n2 = sn(vec2(wx, w.y) * 1.5 + d2 + 10.0);

  vec3 col = grad4(clamp(w.y, 0.0, 1.0));

  col = mix(col, mix(c4, c5, n1), smoothstep(0.35, 0.65, n1) * 0.5);
  col = mix(col, mix(c2, c3, n2), smoothstep(0.4, 0.7, n2) * 0.3);

  float glow = exp(-(uv.y - 0.32 - (w.y - uv.y) * 0.3) * (uv.y - 0.32 - (w.y - uv.y) * 0.3) * 16.0);
  col += c3 * glow * 0.4;

  float wm = smoothstep(0.38, 0.0, uv.y);
  if (wm > 0.0) {
    float depth = 1.0 - uv.y * 2.63;

    vec2 rw = w;
    rw.x += (sin(uv.y * 20.0 + s * 2.5) * 0.03 + sin(uv.y * 10.0 - s * 1.8 + ax * 4.0) * 0.02) * depth;
    rw.y += (cos(ax * 8.0 + s * 2.0) * 0.04 + sin(ax * 5.0 - s * 1.5 + uv.y * 8.0) * 0.025) * depth;

    float my = clamp(0.76 - rw.y, 0.0, 1.0);
    vec3 ref = grad4(my);

    float rwx = rw.x * r.x / r.y;
    float rn1 = sn(vec2(rwx, my) * 2.0 + d1);
    ref = mix(ref, mix(c4, c5, rn1), smoothstep(0.35, 0.65, rn1) * 0.4);

    ref *= 0.7 - depth * 0.15;

    float caustic = sn(vec2(rwx * 3.0, rw.y * 6.0) + vec2(sin(s * 0.8), cos(s * 0.6)) * 2.0);
    ref += c3 * smoothstep(0.6, 0.85, caustic) * 0.15 * (1.0 - depth * 0.6);

    col = mix(col, ref, wm * 0.9);
  }

  vec2 vc = (uv - 0.5) * vec2(1.1, 1.0);
  col *= 1.0 - 0.35 * dot(vc, vc) * 2.0;

  col = pow(col, vec3(0.95, 1.0, 1.05));

  gl_FragColor = vec4(col, 1.0);
}`;

// Neutral gray theme colors (dark)
const OCEAN_COLORS: [number, number, number][] = [
  [0.02, 0.02, 0.03],  // near-black
  [0.05, 0.05, 0.06],  // very dark gray
  [0.12, 0.12, 0.13],  // dark mid
  [0.22, 0.22, 0.24],  // mid gray
  [0.07, 0.07, 0.08],  // accent dark
  [0.16, 0.16, 0.18],  // accent mid
];

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('BackgroundShader compile error:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export function BackgroundShader({ progress, active }: BackgroundShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const uniformsRef = useRef<{
    time: WebGLUniformLocation | null;
    resolution: WebGLUniformLocation | null;
    colors: (WebGLUniformLocation | null)[];
  } | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const timeOriginRef = useRef(performance.now());

  // Draw a single frame immediately (used after resize to avoid black flash)
  function drawFrame() {
    const gl = glRef.current;
    const uniforms = uniformsRef.current;
    if (!gl || !uniforms) return;
    gl.uniform1f(uniforms.time, (performance.now() - timeOriginRef.current) * 0.001);
    gl.uniform2f(uniforms.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Initialize WebGL context, shaders, and geometry once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) return;
    glRef.current = gl;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('BackgroundShader link error:', gl.getProgramInfoLog(prog));
      return;
    }
    programRef.current = prog;
    gl.useProgram(prog);

    // Fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    uniformsRef.current = {
      time: gl.getUniformLocation(prog, 't'),
      resolution: gl.getUniformLocation(prog, 'r'),
      colors: [0, 1, 2, 3, 4, 5].map(i => gl.getUniformLocation(prog, 'c' + i)),
    };

    // Set ocean colors once
    for (let i = 0; i < 6; i++) {
      const loc = uniformsRef.current.colors[i];
      if (loc) gl.uniform3f(loc, OCEAN_COLORS[i][0], OCEAN_COLORS[i][1], OCEAN_COLORS[i][2]);
    }

    return () => {
      gl.deleteProgram(prog);
      glRef.current = null;
      programRef.current = null;
      uniformsRef.current = null;
    };
  }, []);

  // Canvas sizing via ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const obs = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const gl = glRef.current;
      if (gl) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        drawFrame();
      }
    });
    obs.observe(canvas.parentElement);
    return () => obs.disconnect();
  }, []);

  // Animation loop — starts/stops based on `active`
  useEffect(() => {
    if (!active) return;

    const gl = glRef.current;
    const uniforms = uniformsRef.current;
    if (!gl || !uniforms) return;

    let rafId = 0;

    function render() {
      if (!activeRef.current) return;
      gl!.uniform1f(uniforms!.time, (performance.now() - timeOriginRef.current) * 0.001);
      gl!.uniform2f(uniforms!.resolution, gl!.drawingBufferWidth, gl!.drawingBufferHeight);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      rafId = requestAnimationFrame(render);
    }
    rafId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(rafId);
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: progress }}
    />
  );
}
