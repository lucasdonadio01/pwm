/* MUSUQ PACHA · Símbolos — fondo PixelBlast.
   Porteo del efecto de reactbits a WebGL crudo: una sola pasada de fragment
   shader, sin three.js ni postprocessing, para que el .html corra offline.
   La grilla de pixeles late con ruido fbm, se abulta cerca del cursor y
   propaga ondas circulares al hacer click o al generar un simbolo. */

const Fondo = (() => {
  const MAX_ONDAS = 10;
  const VIDA_ONDA = 2.6;

  let cv, gl, prog, quad, u = {}, raf = 0, arranque = 0;
  let ondas = [];
  let raton = [-9999, -9999];
  let cfg = { fondo: '#F2EDE5', tinta: '#DCD4C6', pixel: 9, densidad: 0, quieto: false };

  const VERT = `
    attribute vec2 aPos;
    void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FRAG = `
    precision highp float;
    uniform vec2  uRes;
    uniform float uTime;
    uniform float uPixel;
    uniform vec3  uFondo;
    uniform vec3  uTinta;
    uniform vec2  uRaton;
    uniform float uDensidad;
    uniform vec3  uOndas[${MAX_ONDAS}];

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

    float ruido(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 s = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), s.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), s.x), s.y);
    }

    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { v += a * ruido(p); p = p * 2.03 + 17.0; a *= 0.5; }
      return v;
    }

    void main(){
      vec2 celda  = floor(gl_FragCoord.xy / uPixel);
      vec2 centro = (celda + 0.5) * uPixel;

      float n = fbm(celda * 0.115 + vec2(uTime * 0.05, -uTime * 0.028));
      n = n * 1.36 - 0.28 + uDensidad;
      n += (hash(celda + 0.5) - 0.5) * 0.30;   // dispersion por celda: rompe la mancha

      n += 0.34 * exp(-distance(centro, uRaton) / 90.0);

      for (int i = 0; i < ${MAX_ONDAS}; i++) {
        vec3 o = uOndas[i];
        float edad = uTime - o.z;
        float viva = step(0.0, o.z) * step(0.0, edad) * step(edad, ${VIDA_ONDA.toFixed(1)});
        float anillo = exp(-abs(distance(centro, o.xy) - edad * 430.0) / 48.0);
        n += anillo * max(0.0, 1.0 - edad / ${VIDA_ONDA.toFixed(1)}) * 0.9 * viva;
      }

      vec2 q = gl_FragCoord.xy / uRes;
      float borde = smoothstep(0.0, 0.18, q.x) * smoothstep(0.0, 0.18, 1.0 - q.x)
                  * smoothstep(0.0, 0.14, q.y) * smoothstep(0.0, 0.14, 1.0 - q.y);
      n *= mix(0.5, 1.0, borde);

      // el punto nunca llega a tocar al vecino: siempre queda aire entre pixeles,
      // que es lo que hace que se lea como campo de puntos y no como mancha
      float cobertura = clamp((n - 0.42) / 0.30, 0.0, 1.0) * 0.60;
      float d = length(fract(gl_FragCoord.xy / uPixel) - 0.5);
      float aa = 0.9 / uPixel;
      float forma = 1.0 - smoothstep(cobertura * 0.5 - aa, cobertura * 0.5 + aa, d);

      gl_FragColor = vec4(mix(uFondo, uTinta, forma), 1.0);
    }`;

  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  function compilar(tipo, src) {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function medir() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, cv.width, cv.height);
    return dpr;
  }

  function dibujar(ahora) {
    const t = (ahora - arranque) / 1000;
    const dpr = medir();
    gl.useProgram(prog);
    gl.uniform2f(u.uRes, cv.width, cv.height);
    gl.uniform1f(u.uTime, t);
    gl.uniform1f(u.uPixel, cfg.pixel * dpr);
    gl.uniform1f(u.uDensidad, cfg.densidad);
    gl.uniform3fv(u.uFondo, rgb(cfg.fondo));
    gl.uniform3fv(u.uTinta, rgb(cfg.tinta));
    gl.uniform2f(u.uRaton, raton[0] * dpr, (cv.clientHeight - raton[1]) * dpr);

    const plano = new Float32Array(MAX_ONDAS * 3).fill(-1);
    ondas = ondas.filter(o => t - o.t < VIDA_ONDA).slice(-MAX_ONDAS);
    ondas.forEach((o, i) => {
      plano[i * 3] = o.x * dpr;
      plano[i * 3 + 1] = (cv.clientHeight - o.y) * dpr;
      plano[i * 3 + 2] = o.t;
    });
    gl.uniform3fv(u.uOndas, plano);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return t;
  }

  function bucle(ahora) {
    const t = dibujar(ahora);
    if (!cfg.quieto && t - (bucle.ultima || -99) > 2.4 + Math.random() * 1.6) {
      bucle.ultima = t;
      onda(Math.random() * cv.clientWidth, Math.random() * cv.clientHeight);
    }
    raf = requestAnimationFrame(bucle);
  }

  function onda(x, y) {
    ondas.push({ x, y, t: (performance.now() - arranque) / 1000 });
  }

  function iniciar(canvas) {
    cv = canvas;
    gl = cv.getContext('webgl', { antialias: false, preserveDrawingBuffer: true, alpha: false })
      || cv.getContext('experimental-webgl', { preserveDrawingBuffer: true });
    if (!gl) return false;

    prog = gl.createProgram();
    gl.attachShader(prog, compilar(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compilar(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    ['uRes', 'uTime', 'uPixel', 'uFondo', 'uTinta', 'uRaton', 'uDensidad', 'uOndas']
      .forEach(k => u[k] = gl.getUniformLocation(prog, k));

    arranque = performance.now();
    cfg.quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;

    addEventListener('pointermove', e => { raton = [e.clientX, e.clientY]; }, { passive: true });
    addEventListener('pointerleave', () => { raton = [-9999, -9999]; });
    addEventListener('pointerdown', e => onda(e.clientX, e.clientY), { passive: true });

    raf = requestAnimationFrame(bucle);
    return true;
  }

  function paleta(fondo, tinta) { cfg.fondo = fondo; cfg.tinta = tinta; }

  return { iniciar, onda, paleta, dibujar, cfg, get lienzo() { return cv; } };
})();
