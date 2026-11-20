import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  set,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js";

const canvas = document.getElementById("game");
const context = canvas.getContext("2d");
const joinButton = document.getElementById("join-button");
const leaveButton = document.getElementById("leave-button");
const restartButton = document.getElementById("restart-button");
const nameInput = document.getElementById("player-name");
const statusText = document.getElementById("status");
const canvasMessage = document.getElementById("canvas-message");
const connectionStatus = document.getElementById("connection-status");
const playersList = document.getElementById("players-list");
const scoreboard = document.getElementById("scoreboard");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const PADDLE_LENGTH = 112;
const PADDLE_THICKNESS = 14;
const BALL_RADIUS = 10;
const WINNING_SCORE = 7;
const STARTING_LIVES = 3;
const SLOT_ORDER = ["left", "right", "third"];
const SLOT_NAMES = { left: "Links", right: "Rechts", third: "Unten" };
const TRIANGLE_POINTS = [
  { x: WIDTH / 2, y: 28 },
  { x: 54, y: HEIGHT - 30 },
  { x: WIDTH - 54, y: HEIGHT - 30 },
];
const TRIANGLE_SIDES = {
  left: [TRIANGLE_POINTS[0], TRIANGLE_POINTS[1]],
  third: [TRIANGLE_POINTS[1], TRIANGLE_POINTS[2]],
  right: [TRIANGLE_POINTS[2], TRIANGLE_POINTS[0]],
};

let database;
let currentUid = null;
let currentPlayerRef = null;
let players = {};
let game = waitingGame();
let gameMode = "waiting";
let hostUid = null;
let isJoined = false;
let animationFrame = null;
let lastPublishedAt = 0;
let lastPlayerPublishedAt = 0;
let errorMessage = "";

nameInput.value = localStorage.getItem("pong-player-name") || "";

function waitingGame() {
  return { status: "waiting", mode: "waiting", scores: {}, lives: {}, eliminated: {} };
}

function configIsReady() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.databaseURL &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
  );
}

function orderedPlayers(source = players) {
  return Object.entries(source).sort(
    ([uidA, playerA], [uidB, playerB]) =>
      (playerA.joinedAt || 0) - (playerB.joinedAt || 0) || uidA.localeCompare(uidB),
  );
}

function getMode(count) {
  if (count >= 3) return "triangle";
  if (count === 2) return "classic";
  return "waiting";
}

function classicSlot(uid) {
  return orderedPlayers().findIndex(([playerUid]) => playerUid === uid) === 0
    ? "left"
    : "right";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointAt(side, t) {
  const [start, end] = TRIANGLE_SIDES[side];
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

function renderPlayers() {
  const entries = orderedPlayers();
  playersList.replaceChildren();

  if (entries.length === 0) {
    const waiting = document.createElement("span");
    waiting.className = "waiting-player";
    waiting.textContent = "Warte auf Spieler …";
    playersList.append(waiting);
    return;
  }

  for (const [uid, player] of entries) {
    const item = document.createElement("span");
    item.className = "player-chip";
    item.classList.toggle("is-you", uid === currentUid);

    const dot = document.createElement("span");
    dot.className = "player-dot";
    dot.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.textContent = `${player.name || "Spieler"} · ${SLOT_NAMES[player.slot] || "Spieler"}`;

    const ready = document.createElement("span");
    ready.className = "ready-label";
    ready.textContent = player.ready ? "bereit" : "wartet";

    item.append(dot, label, ready);
    playersList.append(item);
  }

  for (let index = entries.length; index < 3; index += 1) {
    const empty = document.createElement("span");
    empty.className = "player-chip empty";
    empty.textContent = "Freier Platz";
    playersList.append(empty);
  }
}

function renderScoreboard() {
  scoreboard.replaceChildren();

  for (const [uid, player] of orderedPlayers()) {
    const card = document.createElement("div");
    card.className = "score-card";
    card.classList.toggle("is-you", uid === currentUid);

    const label = document.createElement("span");
    label.textContent = player.name || "Spieler";

    const score = document.createElement("strong");
    score.textContent =
      gameMode === "triangle"
        ? `${game.lives?.[uid] ?? STARTING_LIVES} ♥`
        : String(game.scores?.[uid] ?? 0);

    card.append(label, score);
    scoreboard.append(card);
  }
}

function updateStatus() {
  if (errorMessage) {
    statusText.textContent = errorMessage;
    return;
  }

  const count = Object.keys(players).length;
  if (!isJoined) {
    statusText.textContent =
      count >= 3
        ? "Die Lobby ist voll. Versuch es später erneut."
        : count === 0
          ? "Sei der erste Spieler und warte auf Mitspieler."
          : `${count} ${count === 1 ? "Spieler wartet" : "Spieler warten"} auf dich.`;
  } else if (count < 2) {
    statusText.textContent = "Du bist bereit. Warte auf einen Mitspieler …";
  } else if (game.status === "finished") {
    const winner = players[game.winner];
    statusText.textContent = winner ? `${winner.name} hat gewonnen!` : "Die Runde ist vorbei.";
  } else if (gameMode === "triangle") {
    statusText.textContent = "Dreiecksrunde: Verteidige deine Seite – du hast drei Leben.";
  } else {
    statusText.textContent = "Runde läuft – erstes auf 7 Punkte gewinnt.";
  }

  canvasMessage.hidden = game.status === "playing";
  if (game.status === "playing") {
    canvasMessage.textContent = "";
  } else if (count < 2) {
    canvasMessage.textContent = "Warte auf Mitspieler";
  } else if (game.status === "finished") {
    canvasMessage.textContent = "Runde beendet";
  } else {
    canvasMessage.textContent = "Bereit?";
  }

  restartButton.hidden = !isJoined || !isHost() || game.status !== "finished";
}

function render() {
  renderPlayers();
  renderScoreboard();
  updateStatus();
  draw();
}

function rectangle(x, y, width, height, color = "#f9fafb") {
  context.fillStyle = color;
  context.fillRect(x, y, width, height);
}

function drawBall() {
  if (!game.ball) return;
  context.beginPath();
  context.fillStyle = "#69f0ae";
  context.arc(game.ball.x, game.ball.y, BALL_RADIUS, 0, Math.PI * 2);
  context.fill();
}

function drawClassic() {
  rectangle(WIDTH / 2 - 2, 0, 4, HEIGHT, "#26364b");

  for (const [uid, player] of orderedPlayers()) {
    const y = player.t * (HEIGHT - PADDLE_LENGTH);
    const x = classicSlot(uid) === "left" ? 22 : WIDTH - 22 - PADDLE_THICKNESS;
    rectangle(
      x,
      y,
      PADDLE_THICKNESS,
      PADDLE_LENGTH,
      uid === currentUid ? "#69f0ae" : "#f9fafb",
    );
  }
}

function drawTriangle() {
  context.beginPath();
  context.moveTo(TRIANGLE_POINTS[0].x, TRIANGLE_POINTS[0].y);
  context.lineTo(TRIANGLE_POINTS[1].x, TRIANGLE_POINTS[1].y);
  context.lineTo(TRIANGLE_POINTS[2].x, TRIANGLE_POINTS[2].y);
  context.closePath();
  context.strokeStyle = "#f9fafb";
  context.lineWidth = 3;
  context.stroke();

  for (const [uid, player] of orderedPlayers()) {
    const [start, end] = TRIANGLE_SIDES[player.slot];
    if (!start || !end) continue;

    const center = pointAt(player.slot, player.t);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    context.save();
    context.translate(center.x, center.y);
    context.rotate(angle);
    rectangle(
      -PADDLE_LENGTH / 2,
      -PADDLE_THICKNESS / 2,
      PADDLE_LENGTH,
      PADDLE_THICKNESS,
      uid === currentUid ? "#69f0ae" : "#f9fafb",
    );
    context.restore();
  }
}

function draw() {
  context.clearRect(0, 0, WIDTH, HEIGHT);
  if (gameMode === "triangle") drawTriangle();
  else drawClassic();
  drawBall();
}

function newBall(direction = Math.random() > 0.5 ? 1 : -1) {
  return {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    vx: 5.5 * direction,
    vy: (Math.random() * 4 + 2) * (Math.random() > 0.5 ? 1 : -1),
  };
}

function newRound(mode) {
  const scores = {};
  const lives = {};
  for (const [uid] of orderedPlayers()) {
    scores[uid] = 0;
    lives[uid] = STARTING_LIVES;
  }

  return {
    status: "playing",
    mode,
    roundId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ball: newBall(),
    scores,
    lives,
    eliminated: {},
  };
}

function isHost() {
  return currentUid !== null && hostUid === currentUid;
}

async function saveGame() {
  if (!database || !isHost()) return;
  await set(ref(database, "pong/game"), game);
}

function startHostLoop() {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);

  const tick = (time) => {
    if (!isHost() || game.status !== "playing") {
      animationFrame = null;
      return;
    }

    updateBall();
    if (time - lastPublishedAt > 75 || game.status !== "playing") {
      lastPublishedAt = time;
      saveGame().catch(showError);
    }

    draw();
    if (game.status === "playing") {
      animationFrame = requestAnimationFrame(tick);
    } else {
      animationFrame = null;
      render();
    }
  };

  animationFrame = requestAnimationFrame(tick);
}

function ensureRound() {
  if (!isHost()) return;

  if (Object.keys(players).length < 2) {
    if (game.status !== "waiting") {
      game = waitingGame();
      saveGame().catch(showError);
    }
    return;
  }

  const mode = getMode(Object.keys(players).length);
  if (game.status === "waiting" || game.mode !== mode) {
    game = newRound(mode);
    gameMode = mode;
    saveGame().catch(showError);
    startHostLoop();
  } else if (game.status === "playing" && animationFrame === null) {
    startHostLoop();
  }
}

function classicCollision(uid, player) {
  const paddleY = player.t * (HEIGHT - PADDLE_LENGTH);
  const isLeft = classicSlot(uid) === "left";
  const paddleX = isLeft ? 22 : WIDTH - 22 - PADDLE_THICKNESS;
  const movingTowardPaddle = isLeft ? game.ball.vx < 0 : game.ball.vx > 0;
  const overlaps =
    game.ball.y + BALL_RADIUS > paddleY &&
    game.ball.y - BALL_RADIUS < paddleY + PADDLE_LENGTH;

  if (!movingTowardPaddle || !overlaps) return;
  if (isLeft && game.ball.x - BALL_RADIUS > paddleX + PADDLE_THICKNESS) return;
  if (!isLeft && game.ball.x + BALL_RADIUS < paddleX) return;

  game.ball.vx = (isLeft ? 1 : -1) * (Math.abs(game.ball.vx) + 0.18);
  const hit = (game.ball.y - (paddleY + PADDLE_LENGTH / 2)) / (PADDLE_LENGTH / 2);
  game.ball.vy = clamp(hit, -1, 1) * 6;
}

function scoreClassic(missedSlot) {
  const winnerSlot = missedSlot === "left" ? "right" : "left";
  const winner = orderedPlayers().find(([uid]) => classicSlot(uid) === winnerSlot);
  if (winner) {
    game.scores[winner[0]] = (game.scores[winner[0]] || 0) + 1;
    if (game.scores[winner[0]] >= WINNING_SCORE) {
      game.status = "finished";
      game.winner = winner[0];
    }
  }
  if (game.status === "playing") game.ball = newBall(missedSlot === "left" ? 1 : -1);
}

function updateClassic() {
  if (orderedPlayers().length < 2) return;

  game.ball.x += game.ball.vx;
  game.ball.y += game.ball.vy;

  if (game.ball.y - BALL_RADIUS <= 0 || game.ball.y + BALL_RADIUS >= HEIGHT) {
    game.ball.vy *= -1;
  }

  for (const [uid, player] of orderedPlayers()) classicCollision(uid, player);

  if (game.ball.x < -BALL_RADIUS) scoreClassic("left");
  if (game.ball.x > WIDTH + BALL_RADIUS) scoreClassic("right");
}

function triangleCollision(uid, player) {
  const [start, end] = TRIANGLE_SIDES[player.slot];
  if (!start || !end) return false;

  const edgeX = end.x - start.x;
  const edgeY = end.y - start.y;
  const edgeLength = Math.hypot(edgeX, edgeY);
  const normal = { x: edgeY / edgeLength, y: -edgeX / edgeLength };
  const distance =
    (game.ball.x - start.x) * normal.x + (game.ball.y - start.y) * normal.y;
  const velocityOut = game.ball.vx * normal.x + game.ball.vy * normal.y;

  if (distance > BALL_RADIUS || velocityOut >= 0) return false;

  const projection =
    ((game.ball.x - start.x) * edgeX + (game.ball.y - start.y) * edgeY) /
    (edgeLength * edgeLength);
  const halfPaddle = PADDLE_LENGTH / edgeLength / 2;
  const caught =
    projection >= player.t - halfPaddle && projection <= player.t + halfPaddle;

  if (caught) {
    game.ball.vx -= 2 * velocityOut * normal.x;
    game.ball.vy -= 2 * velocityOut * normal.y;
    game.ball.x += normal.x * (BALL_RADIUS - distance + 1);
    game.ball.y += normal.y * (BALL_RADIUS - distance + 1);
    return true;
  }

  game.lives[uid] = Math.max(0, (game.lives[uid] ?? STARTING_LIVES) - 1);
  if (game.lives[uid] === 0) game.eliminated[uid] = true;

  const remaining = orderedPlayers().filter(([playerUid]) => !game.eliminated[playerUid]);
  if (remaining.length <= 1) {
    game.status = "finished";
    game.winner = remaining[0]?.[0] || null;
  } else {
    game.ball = newBall();
  }
  return true;
}

function updateTriangle() {
  game.ball.x += game.ball.vx;
  game.ball.y += game.ball.vy;

  for (const [uid, player] of orderedPlayers()) {
    if (!game.eliminated[uid] && triangleCollision(uid, player)) {
      if (game.status !== "playing") return;
      break;
    }
    if (game.status !== "playing") return;
  }
}

function updateBall() {
  if (!game.ball) return;
  if (gameMode === "triangle") updateTriangle();
  else updateClassic();
}

function showError(error) {
  console.error(error);
  errorMessage = error?.message || "Verbindung fehlgeschlagen. Bitte später erneut versuchen.";
  connectionStatus.textContent = "Verbindung fehlgeschlagen";
  connectionStatus.classList.add("offline");
  joinButton.disabled = true;
  render();
}

function onPlayersChanged(snapshot) {
  players = snapshot.val() || {};
  const entries = orderedPlayers();
  hostUid = entries[0]?.[0] || null;
  gameMode = getMode(entries.length);
  isJoined = Boolean(currentUid && players[currentUid]);

  joinButton.hidden = isJoined;
  joinButton.disabled = !currentUid || entries.length >= 3;
  leaveButton.hidden = !isJoined;
  nameInput.disabled = isJoined;

  connectionStatus.textContent = `${entries.length}/3 online`;
  connectionStatus.classList.remove("offline");

  if (isHost()) ensureRound();
  render();
}

function onGameChanged(snapshot) {
  const nextGame = snapshot.val();
  if (!isHost() || nextGame?.roundId !== game.roundId) {
    game = nextGame || waitingGame();
  }
  if (game.status === "playing") gameMode = game.mode;
  render();

  if (isHost() && game.status === "playing" && animationFrame === null) {
    startHostLoop();
  }
}

async function joinGame() {
  if (!currentUid || !database || isJoined) return;

  const playerName = nameInput.value.trim().slice(0, 18) || "Spieler";
  localStorage.setItem("pong-player-name", playerName);
  const playerRef = ref(database, `pong/players/${currentUid}`);
  currentPlayerRef = playerRef;

  try {
    await onDisconnect(playerRef).remove();
    const result = await runTransaction(ref(database, "pong/players"), (current) => {
      const roster = current || {};
      if (roster[currentUid]) return roster;

      const occupied = new Set(Object.values(roster).map((player) => player.slot));
      const slot = SLOT_ORDER.find((candidate) => !occupied.has(candidate));
      if (!slot) return;

      roster[currentUid] = {
        name: playerName,
        slot,
        ready: true,
        t: 0.5,
        lives: STARTING_LIVES,
        joinedAt: Date.now(),
      };
      return roster;
    });

    if (!result.committed || !result.snapshot.child(currentUid).exists()) {
      await onDisconnect(playerRef).cancel();
      statusText.textContent = "Alle drei Plätze sind belegt. Versuch es später erneut.";
      return;
    }

    isJoined = true;
    render();
  } catch (error) {
    showError(error);
  }
}

async function leaveGame() {
  if (!currentPlayerRef) return;

  try {
    await onDisconnect(currentPlayerRef).cancel();
    await remove(currentPlayerRef);
    currentPlayerRef = null;
    isJoined = false;
    render();
  } catch (error) {
    showError(error);
  }
}

async function restartRound() {
  if (!isHost() || game.status !== "finished") return;
  game = newRound(gameMode);
  await saveGame();
  startHostLoop();
  render();
}

function publishPlayerPosition() {
  if (!isJoined || !currentPlayerRef || !players[currentUid]) return;

  const player = players[currentUid];
  if (gameMode === "triangle") {
    const [start, end] = TRIANGLE_SIDES[player.slot];
    const edgeLength = Math.hypot(end.x - start.x, end.y - start.y);
    const half = PADDLE_LENGTH / edgeLength / 2;
    player.t = clamp(player.t, half, 1 - half);
  } else {
    player.t = clamp(player.t, 0, 1);
  }

  const now = performance.now();
  if (now - lastPlayerPublishedAt < 60) return;
  lastPlayerPublishedAt = now;
  set(currentPlayerRef, player).catch(showError);
  draw();
}

function movePlayerFromPointer(event) {
  if (!isJoined || !players[currentUid]) return;

  const player = players[currentUid];
  const bounds = canvas.getBoundingClientRect();
  const pointer = {
    x: ((event.clientX - bounds.left) / bounds.width) * WIDTH,
    y: ((event.clientY - bounds.top) / bounds.height) * HEIGHT,
  };

  if (gameMode === "triangle") {
    const [start, end] = TRIANGLE_SIDES[player.slot];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    player.t = clamp(
      ((pointer.x - start.x) * dx + (pointer.y - start.y) * dy) / lengthSquared,
      0,
      1,
    );
  } else {
    player.t = clamp(
      (pointer.y - PADDLE_LENGTH / 2) / (HEIGHT - PADDLE_LENGTH),
      0,
      1,
    );
  }
  publishPlayerPosition();
}

async function start() {
  if (!configIsReady()) {
    connectionStatus.textContent = "Firebase noch nicht eingerichtet";
    connectionStatus.classList.add("offline");
    statusText.textContent =
      "Trage zuerst die Web-Konfiguration in firebase-config.js ein. Die Einrichtung steht in README.md.";
    joinButton.disabled = true;
    return;
  }

  try {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    database = getDatabase(app);

    const credential = await signInAnonymously(auth);
    currentUid = credential.user.uid;

    onValue(ref(database, "pong/players"), onPlayersChanged, showError);
    onValue(ref(database, "pong/game"), onGameChanged, showError);

    connectionStatus.textContent = "Verbunden";
    joinButton.disabled = false;
    statusText.textContent = "Du bist verbunden. Wähle einen Namen und sei bereit.";
  } catch (error) {
    showError(error);
  }
}

joinButton.addEventListener("click", joinGame);
leaveButton.addEventListener("click", leaveGame);
restartButton.addEventListener("click", () => restartRound().catch(showError));
canvas.addEventListener("pointerdown", movePlayerFromPointer);
canvas.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch" || event.buttons > 0) {
    movePlayerFromPointer(event);
  }
});

window.addEventListener("keydown", (event) => {
  if (["arrowup", "arrowdown", " "].includes(event.key.toLowerCase())) {
    event.preventDefault();
  }
  if (!isJoined || !players[currentUid]) return;
  if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
    players[currentUid].t -= 0.025;
    publishPlayerPosition();
  }
  if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") {
    players[currentUid].t += 0.025;
    publishPlayerPosition();
  }
});

draw();
start();
