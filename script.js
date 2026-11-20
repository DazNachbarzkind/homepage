const canvas = document.getElementById("game");
const context = canvas.getContext("2d");
const startButton = document.getElementById("start-button");
const statusText = document.getElementById("status");
const playerScoreText = document.getElementById("player-score");
const aiScoreText = document.getElementById("ai-score");

const player = {
  x: 24,
  y: 210,
  width: 16,
  height: 100,
  score: 0,
};

const ai = {
  x: 860,
  y: 210,
  width: 16,
  height: 100,
  score: 0,
};

const ball = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  radius: 10,
  speed: 6,
  velocityX: 6,
  velocityY: 4,
};

let running = false;
let animationId = null;
let keys = {};

function resetBall(direction) {
  ball.x = canvas.width / 2;
  ball.y = canvas.height / 2;
  ball.velocityX = ball.speed * direction;
  ball.velocityY = (Math.random() > 0.5 ? 1 : -1) * 4;
}

function drawRectangle(x, y, width, height) {
  context.fillStyle = "#f9fafb";
  context.fillRect(x, y, width, height);
}

function drawBall() {
  context.beginPath();
  context.fillStyle = "#22c55e";
  context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  context.fill();
  context.closePath();
}

function drawCenterLine() {
  context.fillStyle = "#374151";
  for (let y = 10; y < canvas.height; y += 30) {
    context.fillRect(canvas.width / 2 - 2, y, 4, 15);
  }
}

function draw() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawCenterLine();
  drawRectangle(player.x, player.y, player.width, player.height);
  drawRectangle(ai.x, ai.y, ai.width, ai.height);
  drawBall();
}

function intersects(paddle) {
  return (
    ball.x - ball.radius < paddle.x + paddle.width &&
    ball.x + ball.radius > paddle.x &&
    ball.y - ball.radius < paddle.y + paddle.height &&
    ball.y + ball.radius > paddle.y
  );
}

function movePlayer() {
  if (keys.ArrowUp || keys.w) {
    player.y -= 8;
  }
  if (keys.ArrowDown || keys.s) {
    player.y += 8;
  }

  player.y = Math.max(0, Math.min(canvas.height - player.height, player.y));
}

function moveAi() {
  const aiCenter = ai.y + ai.height / 2;
  const difference = ball.y - aiCenter;

  if (Math.abs(difference) > 14) {
    ai.y += Math.sign(difference) * 5.2;
  }

  ai.y = Math.max(0, Math.min(canvas.height - ai.height, ai.y));
}

function updateBall() {
  ball.x += ball.velocityX;
  ball.y += ball.velocityY;

  if (ball.y - ball.radius <= 0 || ball.y + ball.radius >= canvas.height) {
    ball.velocityY *= -1;
  }

  if (intersects(player)) {
    ball.velocityX = Math.abs(ball.velocityX) + 0.25;
  }

  if (intersects(ai)) {
    ball.velocityX = -Math.abs(ball.velocityX) - 0.25;
  }

  if (ball.x < 0) {
    ai.score += 1;
    aiScoreText.textContent = ai.score;
    resetBall(1);
  } else if (ball.x > canvas.width) {
    player.score += 1;
    playerScoreText.textContent = player.score;
    resetBall(-1);
  }

  if (player.score === 7 || ai.score === 7) {
    endGame();
  }
}

function gameLoop() {
  movePlayer();
  moveAi();
  updateBall();
  draw();

  if (running) {
    animationId = requestAnimationFrame(gameLoop);
  }
}

function startGame() {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }

  player.score = 0;
  ai.score = 0;
  playerScoreText.textContent = "0";
  aiScoreText.textContent = "0";
  player.y = 210;
  ai.y = 210;
  resetBall(Math.random() > 0.5 ? 1 : -1);

  running = true;
  startButton.textContent = "Neu starten";
  statusText.textContent = "Erstes auf 7 Punkte gewinnt.";
  gameLoop();
}

function endGame() {
  running = false;
  cancelAnimationFrame(animationId);
  animationId = null;
  statusText.textContent =
    player.score > ai.score ? "Du hast gewonnen!" : "Die KI hat gewonnen.";
  draw();
}

function movePlayerWithPointer(event) {
  const rectangle = canvas.getBoundingClientRect();
  const pointerY =
    ((event.clientY - rectangle.top) / rectangle.height) * canvas.height;

  player.y = pointerY - player.height / 2;
  player.y = Math.max(0, Math.min(canvas.height - player.height, player.y));
}

window.addEventListener("keydown", (event) => {
  keys[event.key] = true;
  keys[event.key.toLowerCase()] = true;
});

window.addEventListener("keyup", (event) => {
  keys[event.key] = false;
  keys[event.key.toLowerCase()] = false;
});

canvas.addEventListener("mousemove", movePlayerWithPointer);
canvas.addEventListener("pointerdown", movePlayerWithPointer);
canvas.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") {
    movePlayerWithPointer(event);
  }
});

startButton.addEventListener("click", startGame);
draw();
