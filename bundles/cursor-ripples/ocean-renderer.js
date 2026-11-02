/** Visible ocean artwork, mounted behind the application columns by the adapter. */
export function createOceanRenderer(canvas, field) {
  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: 'low-power', preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('WebGL unavailable; background artwork disabled.');
  const resources = { shaders: [], program: null, buffer: null, texture: null };
  function dispose() {
    if (resources.texture) gl.deleteTexture(resources.texture);
    if (resources.buffer) gl.deleteBuffer(resources.buffer);
    if (resources.program) gl.deleteProgram(resources.program);
    for (const shader of resources.shaders) gl.deleteShader(shader);
  }
  function compile(type, source) {
    const shader = gl.createShader(type);
    resources.shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Ocean background shader: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }
  try {
    const vertex = compile(gl.VERTEX_SHADER, `
      attribute vec2 position;
      varying vec2 uv;
      void main() {
        uv = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `);
    const fragment = compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform sampler2D water;
      uniform float aspect;
      uniform float time;
      uniform float darkMode;
      varying vec2 uv;
      float swell(vec2 p) {
        return sin(p.x * 2.7 + p.y * 1.9 - time * .47) * .34
          + sin(p.x * -3.6 + p.y * 5.1 - time * .63) * .18
          + sin(p.x * 9.5 + p.y * 6.3 - time * .91) * .075
          + sin(p.x * -17.0 + p.y * 12.0 + time * .73) * .032;
      }
      void main() {
        vec2 p = vec2(uv.x * aspect, uv.y) * 5.0;
        float e = .025;
        float h = swell(p);
        vec2 slope = vec2(swell(p + vec2(e, 0.0)) - h,
                          swell(p + vec2(0.0, e)) - h) / e;
        vec2 wake = (texture2D(water, vec2(uv.x, 1.0 - uv.y)).rg * 255.0 - 128.0) / 127.0;
        wake.y = -wake.y;
        vec3 n = normalize(vec3(-slope * .21 - wake * 4.2, 1.0));
        vec3 reflected = reflect(vec3(0.0, 0.0, -1.0), n);
        vec3 sun = normalize(vec3(-.33, .47, 1.0));
        float gloss = pow(max(dot(reflected, sun), 0.0), 48.0);
        float broad = pow(max(dot(reflected, sun), 0.0), 6.0);
        vec2 q = p + n.xy * .8;
        float caustic = sin(q.x * 13.0 + sin(q.y * 8.0 + time * .3))
                       * sin(q.y * 11.0 - sin(q.x * 7.0 - time * .27));
        caustic = pow(max(0.0, 1.0 - abs(caustic)), 14.0);
        float trough = clamp(.5 + h * .28 + slope.x * .055, .12, .85);
        vec3 deep = mix(vec3(.10, .34, .43), vec3(.035, .12, .18), darkMode);
        vec3 shallow = mix(vec3(.32, .68, .72), vec3(.09, .34, .40), darkMode);
        vec3 color = mix(deep, shallow, trough);
        color += broad * vec3(.05, .10, .11);
        color += gloss * vec3(.40, .48, .43);
        color += caustic * vec3(.03, .08, .08);
        gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
      }
    `);
    const program = gl.createProgram();
    resources.program = program;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Ocean background shader link: ${gl.getProgramInfoLog(program)}`);
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    resources.buffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture();
    resources.texture = texture;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, field.width, field.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.uniform1i(gl.getUniformLocation(program, 'water'), 0);
    const timeLocation = gl.getUniformLocation(program, 'time');
    const aspectLocation = gl.getUniformLocation(program, 'aspect');
    const darkLocation = gl.getUniformLocation(program, 'darkMode');
    const pixels = new Uint8Array(field.width * field.height * 4);
    gl.clearColor(0, 0, 0, 0);
    return {
      clear() { if (!gl.isContextLost()) gl.clear(gl.COLOR_BUFFER_BIT); },
      draw(time, dark) {
        if (gl.isContextLost()) return;
        field.writeNormals(pixels);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, field.width, field.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.uniform1f(timeLocation, time);
        gl.uniform1f(aspectLocation, canvas.width / canvas.height);
        gl.uniform1f(darkLocation, dark ? 1 : 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
