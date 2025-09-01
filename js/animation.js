var canvas = document.getElementById("background-canvas");
window.addEventListener("DOMContentLoaded", () => {
  canvas = document.getElementById("background-canvas");
  document.addEventListener("mousemove", getMousePos);
});

var width = canvas.width = window.innerWidth * 0.75;
canvas.style.position = "absolute";
canvas.style.top = "0";
canvas.style.left = "0";
canvas.style.zIndex = "-1";
document.body.style.margin = "0";
document.body.style.overflow = "hidden";
var height = canvas.height = document.body.scrollHeight * 0.75;

var gl = canvas.getContext('webgl');

let cursor = { x: -100, y: -100, prevX: -100, prevY: -100, vx: 0, vy: 0 };

// Resize on window change
window.addEventListener('resize', resizeCanvas);

function resizeCanvas() {
  // Set canvas size to match display size
  width = canvas.width = window.innerWidth * 0.75;
  height = canvas.height = document.body.scrollHeight * 0.75;

  // Update WebGL viewport
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
}

function getMousePos(event) {
  // 0 0 and bottom left for canvas
  // 0 0 is top left for event client
  const rect = canvas.getBoundingClientRect();

  // normalized X [0, 1]
  let x = (event.clientX - rect.left) / rect.width;
  let y = 1.0 - ((event.clientY - rect.top) / rect.height); // flip y

  // to canvas space
  x = x * width;
  y = y * height;

  // Compute cursor velocity
  cursor.vx = x - cursor.x;
  cursor.vy = y - cursor.y;

  // Update cursor position
  cursor.prevX = cursor.x;
  cursor.prevY = cursor.y;
  cursor.x = x;
  cursor.y = y;
}

const max_speed_limit = 10.0;
const min_speed_limit = 2.0;
var numMetaballs = 30;
var metaballs = [];

for (var i = 0; i < numMetaballs; i++) {
  var radius = Math.random() * 60 + 10;
  metaballs.push({
    x: Math.random() * (width - 2 * radius) + radius,
    y: Math.random() * (height - 2 * radius) + radius,
    vx: (Math.random() - 0.5) * 3,
    vy: (Math.random() - 0.5) * 3,
    r: radius * 0.75
  });
}

var vertexShaderSrc = `
attribute vec2 position;

void main() {
// position specifies only x and y.
// We set z to be 0.0, and w to be 1.0
gl_Position = vec4(position, 0.0, 1.0);
}
`;

var fragmentShaderSrc = `
precision highp float;

const float WIDTH = ` + (width >> 0) + `.0;
const float HEIGHT = ` + (height >> 0) + `.0;

uniform vec3 metaballs[` + numMetaballs + `];

void main(){
float x = gl_FragCoord.x;
float y = gl_FragCoord.y;

float sum = 0.0;
for (int i = 0; i < ` + numMetaballs + `; i++) {
vec3 metaball = metaballs[i];
float dx = metaball.x - x;
float dy = metaball.y - y;
// adjusted aspect ratio
dx *= 0.5;
dy *= 0.5;
float radius = metaball.z;

sum += (radius * radius) / (dx * dx + dy * dy);
}

vec3 backgroundColor = vec3(0.945, 0.961, 0.98); // Light blue background color
vec3 metaballColor = vec3(0.263, 0.502, 0.714); // Metaball color

if (sum >= 0.99) {
    float alpha = smoothstep(0.99, 1.5, sum); // Smooth fade near the edges
    gl_FragColor = vec4(mix(vec3(x / WIDTH, y / HEIGHT, 1.0), backgroundColor, max(0.0, 1.0 - (sum - 0.99) * 100.0)), 1.0);
    gl_FragColor = vec4(mix(backgroundColor, gl_FragColor.rgb, 0.1*alpha), 1.0);
    return;
}

gl_FragColor = vec4(backgroundColor, 1.0);
}

`;

var vertexShader = compileShader(vertexShaderSrc, gl.VERTEX_SHADER);
var fragmentShader = compileShader(fragmentShaderSrc, gl.FRAGMENT_SHADER);

var program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);
gl.useProgram(program);

var vertexData = new Float32Array([
  -1.0,  1.0, // top left
  -1.0, -1.0, // bottom left
  1.0,  1.0, // top right
  1.0, -1.0, // bottom right
]);
var vertexDataBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vertexDataBuffer);
gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);

var positionHandle = getAttribLocation(program, 'position');
gl.enableVertexAttribArray(positionHandle);
gl.vertexAttribPointer(positionHandle,
                       2, // position is a vec2
                       gl.FLOAT, // each component is a float
                       gl.FALSE, // don't normalize values
                       2 * 4, // two 4 byte float components per vertex
                       0 // offset into each span of vertex data
                      );

var metaballsHandle = getUniformLocation(program, 'metaballs');

loop();
function loop() {
  for (var i = 0; i < numMetaballs; i++) {
    var metaball = metaballs[i];

    metaball.x += metaball.vx;
    metaball.y += metaball.vy;

    // Simple friction to slow the ball over time TODO but would it come to a stop?
    metaball.vx *= 0.99;
    metaball.vy *= 0.99;

    let dir_x = 1;
    let dir_y = 1;
    if (metaball.vx < 0) dir_x = -1;
    if (metaball.vy < 0) dir_y = -1;
    let velocity_x = Math.abs(metaball.vx);
    let velocity_y = Math.abs(metaball.vy);
    // clamp velocity
    velocity_x = Math.min(Math.max(velocity_x, min_speed_limit), max_speed_limit);
    velocity_y = Math.min(Math.max(velocity_y, min_speed_limit), max_speed_limit);
    metaball.vx = velocity_x * dir_x;
    metaball.vy = velocity_y * dir_y;

    // Bounce off cursors
    const dx = metaball.x - cursor.x;
    const dy = metaball.y - cursor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const influenceRadius = 50; // How close cursor needs to be
    if (dist < influenceRadius) {
      // Compute push factor (stronger when closer)
      const factor = (influenceRadius - dist) / influenceRadius;
      metaball.vx += cursor.vx * 0.1 * factor;
      metaball.vy += cursor.vy * 0.1 * factor;
    }

    if (metaball.x < metaball.r || metaball.x > width - metaball.r) metaball.vx *= -1;
    if (metaball.y < metaball.r || metaball.y > height - metaball.r) metaball.vy *= -1;
  }

  var dataToSendToGPU = new Float32Array(3 * numMetaballs);
  for (var i = 0; i < numMetaballs; i++) {
    var baseIndex = 3 * i;
    var mb = metaballs[i];
    dataToSendToGPU[baseIndex + 0] = mb.x;
    dataToSendToGPU[baseIndex + 1] = mb.y;
    dataToSendToGPU[baseIndex + 2] = mb.r;
  }
  gl.uniform3fv(metaballsHandle, dataToSendToGPU);

  //Draw
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  requestAnimationFrame(loop);
}

function compileShader(shaderSource, shaderType) {
  var shader = gl.createShader(shaderType);
  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw "Shader compile failed with: " + gl.getShaderInfoLog(shader);
  }

  return shader;
}

function getUniformLocation(program, name) {
  var uniformLocation = gl.getUniformLocation(program, name);
  if (uniformLocation === -1) {
    throw 'Can not find uniform ' + name + '.';
  }
  return uniformLocation;
}

function getAttribLocation(program, name) {
  var attributeLocation = gl.getAttribLocation(program, name);
  if (attributeLocation === -1) {
    throw 'Can not find attribute ' + name + '.';
  }
  return attributeLocation;
}
