/*
-----------------------------------------------------------------------------
Session Initialization and Performance Metric Tracking. It dynamically determines 
the session type (Tutorial, Adaptive, Normal) via URL parameters. 
For Adaptive Mode, it retrieves the patient's historical progression data 
(Level and Streak) from firebase to maintain a continuous rehabilitation 
trajectory. it also initializes precise performance metric trackers 
(e.g.overall commands, reaction times, wronge moves, model confidence) to objectively evaluate 
the patient's motor function during the session.

Outcome: The environment is configured to track specific movement
data and adapt to the patient's personalized difficulty level .
-----------------------------------------------------------------------------
*/
const urlParams = new URLSearchParams(window.location.search);
const isTutorialMode = urlParams.get('mode') === 'tutorial';
const isAdaptiveMode = urlParams.get('mode') === 'adaptive'; 

var adaptiveLevel = parseInt(localStorage.getItem('adaptiveLevel')) || 1;
var successStreak = parseInt(localStorage.getItem('successStreak')) || 0;

var totalCommands = 0;
var correctGestures = 0;
var wrongMoves = 0; 

var commandStartTime = 0;
var currentCommand = null;
var commandActive = false;

var reactionTimes = [];
var confidenceSum = 0;
var confidenceCount = 0;
var lastObstacleX = 0; 

var aiGesture = "NoHand";
var aiConfidence = 0;

const loadingGif = document.querySelectorAll('.loading-gif');
const mobileDevice = isMobileDevice();

const screenWidth = window.innerWidth;
const screenHeight = window.innerHeight * 1.1;

const velocityX = screenWidth / 9;
const velocityY = screenHeight / 0.9;

const levelGravity = velocityY * 2;

const KIDS_SPEED_MULTIPLIER = 1; 
const WARNING_DISTANCE = screenWidth * 0.4; 

var gamePaused = false;
var pauseText;

var config = {
    type: Phaser.AUTO,
    render: {
        pixelArt: true, 
        antialias: false,
    },
    width: screenWidth,
    height: screenHeight,
    backgroundColor: 0x8585FF,
    parent: 'game',
    preserveDrawingBuffer: true,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: levelGravity },
            debug: false
        }
    },
    scene: {
        key: 'level-1',
        preload: preload,
        create: create,
        update: update
    },
    version: '0.7.7'
};

/*
-----------------------------------------------------------------------------
World Dimensional Scaling
The physical length of the game world is dynamically calculated based on the 
active therapeutic mode. The Tutorial mode is kept intentionally short to prevent 
cognitive overload, while the Adaptive mode scales the total track length 
relative to the patient's current clinical level to ensure adequate space for 
procedurally generated obstacles.

Outcome: Ensures the rehabilitation "dosage" (session duration and physical 
demand) directly correlates with the patient's proven motor capabilities.
-----------------------------------------------------------------------------
*/
const platformPieces = isTutorialMode ? 30 : (isAdaptiveMode ? (50 + adaptiveLevel * 10) : 100); 
const worldWidth = screenWidth * (isTutorialMode ? 4 : (isAdaptiveMode ? (5 + adaptiveLevel * 2) : 11));
const platformHeight = screenHeight / 5;

const startOffset = screenWidth / 2.5;
const platformPiecesWidth = (worldWidth - screenWidth) / platformPieces;

var isLevelOverworld;
var worldHolesCoords = [];
var emptyBlocksList = [];

var player;
var playerController;
var playerState = 0;
var playerInvulnerable = false;
var playerBlocked = false;
var playerFiring = false;
var fireInCooldown = false;
var furthestPlayerPos = 0;

var flagRaised = false;

var controlKeys = {
    JUMP: null, DOWN: null, LEFT: null, RIGHT: null, FIRE: null, PAUSE: null
};

var score = 0;
var timeLeft = 300;
var levelStarted = false;
var reachedLevelEnd = false;
var smoothedControls;
var gameOver = false;
var gameWinned = false;

var game = new Phaser.Game(config);


const marioTextStyle = {
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: "36px",
    fill: "#ffffff",
    align: "center"
};

function updateTextBg(textObj, bgObj) {
    if (!textObj || !bgObj) return;
    bgObj.clear();
    bgObj.fillStyle(0xC48A48, 1); 
    bgObj.lineStyle(6, 0x5A3A22, 1); 
    let b = textObj.getBounds();
    bgObj.fillRoundedRect(b.x - 25, b.y - 15, b.width + 50, b.height + 30, 20);
    bgObj.strokeRoundedRect(b.x - 25, b.y - 15, b.width + 50, b.height + 30, 20);
}

function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/*
-----------------------------------------------------------------------------
Real-time AI Integration Polling
This asynchronous polling mechanism acts as the crucial bridge between the 
clinical frontend and the computer vision backend. Executing repeatedly at a 
100-millisecond interval, it continuously fetches the latest recognized hand 
state and the AI's confidence score from the local server.

Outcome: Provides a near zero-latency translation of the patient's physical 
hand movements into the digital environment, ensuring the game strictly reacts 
to real-time physical performance.
-----------------------------------------------------------------------------
*/
function fetchGesture() {
    if (gamePaused) return;

    fetch("http://127.0.0.1:8000/gesture")
        .then(response => response.json())
        .then(data => {
            aiGesture = data.gesture;
            aiConfidence = data.confidence;
        })
        .catch(err => {});
}

setInterval(fetchGesture, 100);

/*function togglePause() {
    if (gameOver || gameWinned || !levelStarted) return;

    gamePaused = !gamePaused;

    if (gamePaused) {
        this.physics.pause();
        this.anims.pauseAll();
        this.pauseSound.play();
        
        pauseText.setVisible(true);
        this.pauseBg.setVisible(true);
        this.commandText.setText("⏸️ اللعبة متوقفة ⏸️");
        updateTextBg(this.commandText, this.commandBg);
        
        this.pauseOverlay = this.add.rectangle(0, 0, worldWidth, screenHeight, 0x000000, 0.4)
            .setOrigin(0).setScrollFactor(0).setDepth(2000);
    } else {
        this.physics.resume();
        this.anims.resumeAll();
        this.pauseSound.play();
        
        pauseText.setVisible(false);
        this.pauseBg.setVisible(false);
        if (this.pauseOverlay) this.pauseOverlay.destroy();
        this.commandText.setText(currentCommand === "Close" ? "⚠️ اغلق يدك للقفز ⚠️" : "🟢 افتح يدك للركض 🟢");
        updateTextBg(this.commandText, this.commandBg);
    }
}*/

function togglePause() {
    if (gameOver || gameWinned || !levelStarted) return;

    gamePaused = !gamePaused;

    if (gamePaused) {
        this.physics.pause();
        this.anims.pauseAll();
        this.pauseSound.play();
        
        pauseText.setVisible(true);
        this.pauseBg.setVisible(true);
        this.commandText.setText("⏸️ اللعبة متوقفة ⏸️");
        updateTextBg(this.commandText, this.commandBg);
        
        this.pauseOverlay = this.add.rectangle(0, 0, worldWidth, screenHeight, 0x000000, 0.4)
            .setOrigin(0).setScrollFactor(0).setDepth(2000);

    
        this.exitButton = this.add.text(screenWidth / 2, screenHeight / 2 + 120, " خروج من اللعبة", {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: "32px",
            fill: "#ffffff",
            backgroundColor: "#d58814", 
            padding: { x: 20, y: 15 },
            align: "center"
        }).setOrigin(0.5).setScrollFactor(0).setDepth(3000).setInteractive();

        
        this.exitButton.on('pointerdown', async (pointer, localX, localY, event) => {
            event.stopPropagation(); 
            
            
            try {
                console.log("Stopping camera...");
                await fetch("http://127.0.0.1:8000/stop");
            } catch (error) {
                console.error("Error stopping camera:", error);
            }
            
           window.location.href = "../index.html"; 
        });

    } else {
        this.physics.resume();
        this.anims.resumeAll();
        this.pauseSound.play();
        
        pauseText.setVisible(false);
        this.pauseBg.setVisible(false);
        
        if (this.pauseOverlay) this.pauseOverlay.destroy();
        
    
        if (this.exitButton) this.exitButton.destroy();

        this.commandText.setText(currentCommand === "Close" ? "⚠️ اغلق يدك للقفز ⚠️" : "🟢 افتح يدك للركض 🟢");
        updateTextBg(this.commandText, this.commandBg);
    }
}
var SmoothedHorionztalControl = new Phaser.Class({
    initialize:
    function SmoothedHorionztalControl(speed) {
            this.msSpeed = speed;
            this.value = 0;
    },
    moveLeft: function(delta) {
        if (this.value > 0) { this.reset(); }
        this.value -= this.msSpeed * 3.5;
        if (this.value < -1) { this.value = -1; }
        playerController.time.rightDown += delta;
    },
    moveRight: function(delta) {
        if (this.value < 0) { this.reset(); }
        this.value += this.msSpeed * 3.5;
        if (this.value > 1) { this.value = 1; }
        playerController.time.leftDown += delta;
    },
    reset: function() {
        this.value = 0;
    }
});

function preload() {
    var progressBox = this.add.graphics();
    var progressBar = this.add.graphics();
    progressBox.fillStyle(0x222222, 1);
    progressBox.fillRoundedRect(screenWidth / 2.48, screenHeight / 2 * 1.05, screenWidth / 5.3, screenHeight / 20.7, 10);
    
    var width = this.cameras.main.width;
    var height = this.cameras.main.height;
    
    var percentText = this.make.text({
        x: width / 2,
        y: height / 2 * 1.25,
        text: '0%',
        style: { font: screenWidth / 96 + 'px pixel_nums', fill: '#ffffff' }
    });
    percentText.setOrigin(0.5, 0.5);
    
    this.load.on('progress', function (value) {
        percentText.setText(value * 99 >= 99 ? 'جاري بناء المرحلة..' : 'جاري التحميل ' + parseInt(value * 99) + '%');
        progressBar.clear();
        progressBar.fillStyle(0xffffff, 1);
        progressBar.fillRoundedRect(screenWidth / 2.45, screenHeight / 2 * 1.07, screenWidth / 5.6 * value, screenHeight / 34.5, 5);
    });
    
    this.load.on('complete', function () {
        progressBar.destroy(); progressBox.destroy(); percentText.destroy();
        loadingGif.forEach(gif => {gif.style.display = 'none';});
    });

    this.load.bitmapFont('carrier_command', 'assets/fonts/carrier_command.png', 'assets/fonts/carrier_command.xml');
    this.load.plugin('rexvirtualjoystickplugin', 'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexvirtualjoystickplugin.min.js', true);
    
    isLevelOverworld = Phaser.Math.Between(0, 100) <= 84;
    let levelStyle = isLevelOverworld ? 'overworld' : 'underground';

    this.load.spritesheet('mario', 'assets/entities/mario.png', { frameWidth: 18, frameHeight: 16 });
    this.load.spritesheet('mario-grown', 'assets/entities/mario-grown.png', { frameWidth: 18, frameHeight: 32 });
    this.load.spritesheet('mario-fire', 'assets/entities/mario-fire.png', { frameWidth: 18, frameHeight: 32 });
    this.load.spritesheet('goomba', 'assets/entities/' + levelStyle + '/goomba.png', { frameWidth: 16, frameHeight: 16 });
    
    this.load.image('cloud1', 'assets/scenery/overworld/cloud1.png');
    this.load.image('cloud2', 'assets/scenery/overworld/cloud2.png');
    this.load.image('mountain1', 'assets/scenery/overworld/mountain1.png');
    this.load.image('mountain2', 'assets/scenery/overworld/mountain2.png');
    this.load.image('fence', 'assets/scenery/overworld/fence.png');
    this.load.image('bush1', 'assets/scenery/overworld/bush1.png');
    this.load.image('bush2', 'assets/scenery/overworld/bush2.png');
    this.load.image('castle', 'assets/scenery/castle.png');
    this.load.image('flag-mast', 'assets/scenery/flag-mast.png');
    this.load.image('final-flag', 'assets/scenery/final-flag.png');
    this.load.image('sign', 'assets/scenery/sign.png');
    
    this.load.image('horizontal-tube', 'assets/scenery/horizontal-tube.png');
    this.load.image('horizontal-final-tube', 'assets/scenery/horizontal-final-tube.png');
    this.load.image('vertical-extralarge-tube', 'assets/scenery/vertical-large-tube.png');
    this.load.image('vertical-small-tube', 'assets/scenery/vertical-small-tube.png');
    this.load.image('vertical-medium-tube', 'assets/scenery/vertical-medium-tube.png');
    
    this.load.image('gear', 'assets/hud/gear.png');
    this.load.image('settings-bubble', 'assets/hud/settings-bubble.png');
    this.load.spritesheet('npc', 'assets/hud/npc.png', { frameWidth: 16, frameHeight: 24 });
    
    this.load.image('floorbricks', 'assets/scenery/' + levelStyle + '/floorbricks.png');
    this.load.image('start-floorbricks', 'assets/scenery/overworld/floorbricks.png');
    this.load.image('block', 'assets/blocks/' + levelStyle + '/block.png');
    this.load.image('block2', 'assets/blocks/underground/block2.png');
    this.load.image('emptyBlock', 'assets/blocks/' + levelStyle + '/emptyBlock.png');
    this.load.image('immovableBlock', 'assets/blocks/' + levelStyle + '/immovableBlock.png');
    this.load.spritesheet('brick-debris', 'assets/blocks/' + levelStyle + '/brick-debris.png', { frameWidth: 8, frameHeight: 8 });
    this.load.spritesheet('mistery-block', 'assets/blocks/' + levelStyle + '/misteryBlock.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('custom-block', 'assets/blocks/overworld/customBlock.png', { frameWidth: 16, frameHeight: 16 });
    
    this.load.spritesheet('coin', 'assets/collectibles/coin.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('ground-coin', 'assets/collectibles/underground/ground-coin.png', { frameWidth: 10, frameHeight: 14 });
    this.load.spritesheet('fire-flower', 'assets/collectibles/' + levelStyle + '/fire-flower.png', { frameWidth: 16, frameHeight: 16 });
    this.load.image('live-mushroom', 'assets/collectibles/live-mushroom.png');
    
    this.load.audio('music', 'assets/sound/music/overworld/theme.mp3');
    this.load.audio('underground-music', 'assets/sound/music/underground/theme.mp3');
    this.load.audio('hurry-up-music', 'assets/sound/music/' + levelStyle +'/hurry-up-theme.mp3');
    this.load.audio('gameoversong', 'assets/sound/music/gameover.mp3');
    this.load.audio('win', 'assets/sound/music/win.wav');
    this.load.audio('jumpsound', 'assets/sound/effects/jump.mp3');
    this.load.audio('coin', 'assets/sound/effects/coin.mp3');
    this.load.audio('powerdown', 'assets/sound/effects/powerdown.mp3');
    this.load.audio('goomba-stomp', 'assets/sound/effects/goomba-stomp.wav');
    this.load.audio('flagpole', 'assets/sound/effects/flagpole.mp3');
    this.load.audio('here-we-go', Phaser.Math.Between(0, 100) < 98 ? 'assets/sound/effects/here-we-go.mp3' : 'assets/sound/effects/cursed-here-we-go.mp3');
    this.load.audio('pauseSound', 'assets/sound/effects/pause.wav');
    this.load.audio('block-bump', 'assets/sound/effects/block-bump.wav');
    this.load.audio('break-block', 'assets/sound/effects/break-block.wav');
}

function initSounds() {
    this.musicGroup = this.add.group();
    this.effectsGroup = this.add.group();

    this.musicTheme = this.sound.add('music', { volume: 0.15 });
    this.musicTheme.play({ loop: -1 });
    this.musicGroup.add(this.musicTheme);
    this.undergroundMusicTheme = this.sound.add('underground-music', { volume: 0.15 });
    this.hurryMusicTheme = this.sound.add('hurry-up-music', { volume: 0.15 });
    this.gameOverSong = this.sound.add('gameoversong', { volume: 0.3 });
    this.winSound = this.sound.add('win', { volume: 0.3 });
    this.jumpSound = this.sound.add('jumpsound', { volume: 0.10 });
    this.coinSound = this.sound.add('coin', { volume: 0.2 });
    this.powerDownSound = this.sound.add('powerdown', { volume: 0.3 });
    this.goombaStompSound = this.sound.add('goomba-stomp', { volume: 1 });
    this.flagPoleSound = this.sound.add('flagpole', { volume: 0.3 });
    this.hereWeGoSound = this.sound.add('here-we-go', { volume: 0.17 });
    this.pauseSound = this.sound.add('pauseSound', { volume: 0.17 });
    this.blockBumpSound = this.sound.add('block-bump', { volume: 0.3 });
    this.breakBlockSound = this.sound.add('break-block', { volume: 0.5 });
}

function create() {
    let startText = isTutorialMode ? "مرحلة التعليم" : "اللعبة تبدأ";
    
    this.commandBg = this.add.graphics().setScrollFactor(0).setDepth(999);
    this.pauseBg = this.add.graphics().setScrollFactor(0).setDepth(2999).setVisible(false);

    this.commandText = this.add.text(screenWidth / 2, 80, startText, marioTextStyle)
        .setOrigin(0.5).setScrollFactor(0).setDepth(1000); 
    
    updateTextBg(this.commandText, this.commandBg);

    pauseText = this.add.text(screenWidth / 2, screenHeight / 2, "PAUSED\nاضغط ESC أو أي مكان للإكمال", {
        ...marioTextStyle, 
        fontSize: "48px",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(3000).setVisible(false).setInteractive();
    
    updateTextBg(pauseText, this.pauseBg);
    
    pauseText.on('pointerdown', () => togglePause.call(this));

    playerController = { time: { leftDown: 0, rightDown: 0 }, direction: { positive: true }, speed: { run: velocityX } };

    this.physics.world.setBounds(0, 0, worldWidth, screenHeight);
    this.cameras.main.setBounds(0, 0, worldWidth, screenHeight);
    this.cameras.main.isFollowing = false;

    initSounds.call(this);
    createAnimations.call(this);
    createPlayer.call(this);
    
    // Display adaptive level on screen if in adaptive mode
    if (isAdaptiveMode) {
        this.levelDisplayText = this.add.text(20, 20, "المستوى: " + adaptiveLevel, {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: "24px",
            fill: "#ffffff",
            stroke: "#000000",
            strokeThickness: 4
        }).setScrollFactor(0).setDepth(5000); 
    }
    
    generateLevel.call(this);
    drawWorld.call(this);
    drawStartScreen.call(this);
    createGoombas.call(this);
    createControls.call(this);
    
    if (typeof applySettings === 'function') applySettings.call(this);
    
    smoothedControls = new SmoothedHorionztalControl(0.001);

    this.input.keyboard.on('keydown-ESC', () => { togglePause.call(this); });
}

function createControls() {
    const keyNames = ['JUMP', 'DOWN', 'LEFT', 'RIGHT', 'FIRE', 'PAUSE'];
    const defaultCodes = [Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.S, Phaser.Input.Keyboard.KeyCodes.A, Phaser.Input.Keyboard.KeyCodes.D, Phaser.Input.Keyboard.KeyCodes.Q, Phaser.Input.Keyboard.KeyCodes.ESC];
    
    keyNames.forEach((keyName, i) => {
      const keyCode = localStorage.getItem(keyName) ? Number(localStorage.getItem(keyName)) : defaultCodes[i];
      controlKeys[keyName] = this.input.keyboard.addKey(keyCode);
    });
}

function generateRandomCoordinate(entitie = false, ground = true) {
    const startPos = entitie ? screenWidth * 1.5 : screenWidth;
    const endPos = entitie ? worldWidth - screenWidth * 3 : worldWidth;
    let coordinate = Phaser.Math.Between(startPos, endPos);
    if (!ground) return coordinate;
    for (let hole of worldHolesCoords) {
      if (coordinate >= hole.start - platformPiecesWidth * 1.5 && coordinate <= hole.end) {
        return generateRandomCoordinate.call(this, entitie, ground);
      }
    }
    return coordinate;
}
  
function drawWorld() {
    this.add.rectangle(screenWidth, 0,worldWidth, screenHeight, isLevelOverworld ? 0x8585FF : 0x000000).setOrigin(0).depth = -1;
    let propsY = screenHeight - platformHeight;

    if (isLevelOverworld) {
        for (i = 0; i < Phaser.Math.Between(Math.trunc(worldWidth / 2000), Math.trunc(worldWidth / 380)); i++) {
            let x = generateRandomCoordinate(false, false); let y = Phaser.Math.Between(screenHeight / 80, screenHeight / 2.2);
            this.add.image(x, y, Phaser.Math.Between(0, 10) < 5 ? 'cloud1' : 'cloud2').setOrigin(0).setScale(screenHeight / 1725);
        }
        for (i = 0; i < Phaser.Math.Between(worldWidth / 10000, worldWidth / 3800); i++) {
            let x = generateRandomCoordinate();
            this.add.image(x, propsY, Phaser.Math.Between(0, 10) < 5 ? 'mountain1' : 'mountain2').setOrigin(0, 1).setScale(screenHeight / 517);
        }
        for (i = 0; i < Phaser.Math.Between(Math.trunc(worldWidth / 960), Math.trunc(worldWidth / 760)); i++) {
            let x = generateRandomCoordinate();
            this.add.image(x, propsY, Phaser.Math.Between(0, 10) < 5 ? 'bush1' : 'bush2').setOrigin(0, 1).setScale(screenHeight / 609);
        }
    }

    this.finalFlagMast = this.add.tileSprite(worldWidth - (worldWidth / 30), propsY, 16, 167, 'flag-mast').setOrigin(0, 1).setScale(screenHeight / 400);
    this.physics.add.existing(this.finalFlagMast);
    this.finalFlagMast.immovable = true;
    this.finalFlagMast.allowGravity = false;
    this.finalFlagMast.body.setSize(3, 167);
    this.physics.add.overlap(player, this.finalFlagMast, null, raiseFlag, this);
    this.physics.add.collider(this.platformGroup.getChildren(), this.finalFlagMast);

    this.finalFlag = this.add.image(worldWidth - (worldWidth / 30), propsY * 0.93, 'final-flag').setOrigin(0.5, 1);
    this.finalFlag.setScale(screenHeight / 400);
    this.add.image(worldWidth - (worldWidth / 75), propsY, 'castle').setOrigin(0.5, 1).setScale(screenHeight / 300);
}

// Procedurally generates the level layout, including platforms and holes, based on the current mode.
// It integrates the Adaptive Mode logic to dynamically scale the track's difficulty based on the patient's level.
function generateLevel() {
    let pieceStart = screenWidth;
    let lastWasHole = 0;
    let lastWasStructure = 0;
    let pieceIndex = 0;

    // Calculates the total number of physical obstacles (holes) based on the active session mode.
    // If Adaptive Mode is active, the obstacle count scales mathematically with the patient's current level.
    // If Normal Mode is active, it defaults to a fixed baseline of 3 obstacles.
    let totalHolesRequired = isAdaptiveMode ? (1 + (adaptiveLevel * 2)) : 3;
    
    // Tracks the remaining number of holes that need to be procedurally generated.
    let holesBudget = totalHolesRequired;
    
    // Initializes an array to store the exact coordinates of every generated hole. 
    // This array is later accessed by the game loop to trigger the "Close" hand gesture prompts at the correct distances.
    worldHolesCoords = [];
    
    let usableStart = screenWidth * 1.5;
    let usableEnd = worldWidth - (screenWidth * 2.0);
    let totalUsableSpace = usableEnd - usableStart;
    
    // Algorithmically calculates the distance between obstacles to ensure they are evenly spaced across the track length.
    let spacingBetweenHoles = totalUsableSpace / (totalHolesRequired + 1);
    
    this.platformGroup = this.add.group();
    this.fallProtectionGroup = this.add.group();
    this.blocksGroup = this.add.group();
    this.constructionBlocksGroup = this.add.group();
    this.misteryBlocksGroup = this.add.group();
    this.immovableBlocksGroup = this.add.group();
    
    while (pieceStart < worldWidth) {

        let shouldCreateHole = false;
        
        // Determines the target coordinate for the next obstacle based on the dynamic spacing calculation.
        let nextHoleTarget = usableStart + (totalHolesRequired - holesBudget + 1) * spacingBetweenHoles;
        
        // Strictly prevents hole generation if the session is in Tutorial Mode, keeping the track safe.
        // For Adaptive/Normal modes, it checks if the spacing requirement is met to spawn the next obstacle.
        if (!isTutorialMode && holesBudget > 0 && pieceStart >= (usableStart + (totalHolesRequired - holesBudget + 1) * spacingBetweenHoles)) {
            if (lastWasHole <= 0 && lastWasStructure <= 0 && pieceStart < usableEnd) {
                shouldCreateHole = true;
                holesBudget--;
            }
        }
        
        if (!shouldCreateHole) {

            lastWasHole--;
            
            let Npiece = this.add.tileSprite(pieceStart, screenHeight, platformPiecesWidth, platformHeight, 'floorbricks').setScale(2).setOrigin(0, 0.5);
            this.physics.add.existing(Npiece, true);
            Npiece.isPlatform = true;
            Npiece.depth = 2;
            this.platformGroup.add(Npiece);
            this.physics.add.collider(player, Npiece);

            if (lastWasHole < 1 && lastWasStructure < 1 && pieceStart > screenWidth * 1.1 && pieceStart < usableEnd) {
                
                if (pieceIndex % 10 === 0) {
                    if (typeof createSingleGoomba === 'function') {
                        createSingleGoomba.call(this, pieceStart + 30, screenHeight - platformHeight - 50);
                    }
                }
                
                if (pieceIndex % 6 === 0) {
                    if (typeof generateStructure === 'function') {
                        lastWasStructure = generateStructure.call(this, pieceStart);
                    }
                }
            } else {
                lastWasStructure--;
            }

        } else {
            
            // Records the exact start and end coordinates of the generated hole into the tracking array.
            // The AI synchronization loop reads these coordinates to know exactly when to prompt the patient to jump.
            worldHolesCoords.push({ start: pieceStart, end: pieceStart + platformPiecesWidth * 2});
            
            lastWasHole = 3; 
            this.fallProtectionGroup.add(this.add.rectangle(pieceStart + platformPiecesWidth * 2, screenHeight - platformHeight, 5, 5).setOrigin(0, 1));
            this.fallProtectionGroup.add(this.add.rectangle(pieceStart, screenHeight - platformHeight, 5, 5).setOrigin(1, 1));
        }
        pieceStart += platformPiecesWidth * 2;
        pieceIndex++;
    }
    
    [this.misteryBlocksGroup, this.blocksGroup, this.constructionBlocksGroup].forEach(group => {
        this.physics.add.collider(player, group, group === this.misteryBlocksGroup ? revealHiddenBlock : destroyBlock, null, this);
    });
    
    this.startScreenTrigger = this.add.tileSprite(screenWidth, screenHeight - platformHeight, 32, 28, 'horizontal-tube').setScale(screenHeight / 345).setOrigin(1, 1);
    this.startScreenTrigger.depth = 4;
    this.physics.add.existing(this.startScreenTrigger);
    this.startScreenTrigger.body.allowGravity = false;
    this.startScreenTrigger.body.immovable = true;
    this.physics.add.collider(player, this.startScreenTrigger, startLevel, null, this);
    let invisibleWall2 = this.add.rectangle(screenWidth, screenHeight - platformHeight, 1, screenHeight).setOrigin(0.5, 1);
    this.physics.add.existing(invisibleWall2);
    invisibleWall2.body.allowGravity = false;
    invisibleWall2.body.immovable = true;
    this.physics.add.collider(player, invisibleWall2);
    this.fallProtectionGroup.add(invisibleWall2);
    if (!isLevelOverworld) {
        this.finalTrigger = this.add.tileSprite(worldWidth - screenWidth * 1.03, screenHeight - platformHeight, 40, 31, 'horizontal-final-tube').setScale(screenHeight / 345).setOrigin(1, 1);

        this.finalTrigger.depth = 2;

        this.physics.add.existing(this.finalTrigger);

        this.finalTrigger.body.allowGravity = false;

        this.finalTrigger.body.immovable = true;

        this.physics.add.collider(player, this.finalTrigger, teleportToLevelEnd, null, this);

    }
    
    [this.fallProtectionGroup, this.misteryBlocksGroup, this.blocksGroup, this.constructionBlocksGroup, this.immovableBlocksGroup].forEach(group => {
        group.getChildren().forEach(child => {
            this.physics.add.existing(child, true);
            child.body.allowGravity = false;
            child.body.immovable = true;
            child.depth = 2;
            
            if (group === this.misteryBlocksGroup) {
                child.anims.play('mistery-block-default', true);
                this.physics.add.collider(player, child, revealHiddenBlock, null, this);
            } else if (group === this.blocksGroup || group === this.constructionBlocksGroup) {
                this.physics.add.collider(player, child, destroyBlock, null, this);
            } else if (group === this.immovableBlocksGroup) {
                this.physics.add.collider(player, child);
            }
        });
    });

}

function destroyBlock(player, block) {
    if (!player.body.blocked.up) return;

    if (playerState > 0) { 
        if (this.breakBlockSound) this.breakBlockSound.play();
        
        block.disableBody(true, true); 
        block.destroy(); 
    } else { 
        
        if (block.isBumping) return;
        block.isBumping = true;
        if (this.blockBumpSound) this.blockBumpSound.play();
        
        block.y -= 5;
        this.time.delayedCall(60, () => {
            if (block && block.body) {
                block.y += 5;
                block.isBumping = false;
            }
        });
    }
}

function revealHiddenBlock(player, block) {
    
    if (!player.body.blocked.up || block.isEmpty || block.isAnimating) return;

    block.isAnimating = true; 
    block.isEmpty = true; 
    block.setFrame(1); 
    if (this.coinSound) this.coinSound.play();

    const originalY = block.y;
    block.y -= 5;
    
    this.time.delayedCall(100, () => {
        block.y = originalY;
        block.isAnimating = false; 
        
        if (block.body) block.body.updateFromGameObject();
    });
}

function startLevel(player, trigger) {
    if (!player.body.blocked.right && !trigger.body.blocked.left) return;

    this.powerDownSound.play();
    this.physics.world.setBounds(screenWidth, 0, worldWidth, screenHeight);
    if(typeof applyPlayerInvulnerability === 'function') applyPlayerInvulnerability.call(this, 4000);
    playerBlocked = true; player.setVelocityX(5); player.anims.play('run', true).flipX = false;
    this.cameras.main.fadeOut(900, 0, 0, 0); this.hereWeGoSound.play();

    setTimeout(() => {
        if (!isLevelOverworld) {
            player.y = screenHeight / 5; this.musicTheme.stop(); this.undergroundMusicTheme.play({ loop: -1 });
        }
        player.x = screenWidth * 1.1; this.cameras.main.pan(screenWidth * 1.5, 0, 0);
        playerBlocked = false; this.cameras.main.fadeIn(500, 0, 0, 0);
        if(typeof createHUD === 'function') createHUD.call(this); 
        if(typeof updateTimer === 'function') updateTimer.call(this); 
        this.startScreenTrigger.destroy();

        levelStarted = true;
        
        // Initializes the session by rendering the first gesture command on the UI layer.
        // Instructs the patient to execute the "Open" hand gesture to initiate character movement.
        this.commandText.setText("🟢 افتح يدك للركض 🟢");
        updateTextBg(this.commandText, this.commandBg);
        
        if (this.settingsMenuOpen) { if(typeof hideSettings === 'function') hideSettings.call(this); }
    }, 1100);
}

function teleportToLevelEnd(player, trigger) {
    if (!player.body.blocked.right && !trigger.body.blocked.left) return;
    
    playerBlocked = true; this.cameras.main.stopFollow(); this.powerDownSound.play();

    this.tweens.add({ targets: player, duration: 75, alpha: 0 });
    this.cameras.main.fadeOut(450, 0, 0, 0);
    player.anims.play(playerState > 0 ? playerState == 1 ? 'grown-mario-run'  : 'fire-mario-run' : 'run', true).flipX = false;
    this.undergroundRoof.destroy();

    setTimeout(() => {
        this.physics.world.setBounds(worldWidth - screenWidth, 0, worldWidth, screenHeight);
        this.tpTube = this.add.tileSprite(worldWidth - screenWidth / 1.089, screenHeight - platformHeight, 32, 32, 'vertical-medium-tube').setScale(screenHeight / 345).setOrigin(1);
        this.tpTube.depth = 4; this.physics.add.existing(this.tpTube); this.tpTube.body.allowGravity = false; this.tpTube.body.immovable = true;
        this.physics.add.collider(player, this.tpTube);
        this.add.rectangle(worldWidth - screenWidth, 0, worldWidth, screenHeight,0x8585FF).setOrigin(0).depth = -1;
        this.add.tileSprite(worldWidth - screenWidth, screenHeight, screenWidth, platformHeight, 'start-floorbricks').setScale(2).setOrigin(0, 0.5).depth = 2;
    }, 500);

    setTimeout(() => {
        player.alpha = 1; player.x = worldWidth - screenWidth / 1.08;
        this.cameras.main.pan(worldWidth - screenWidth / 2, 0, 0); this.cameras.main.fadeIn(500, 0, 0, 0);
        this.powerDownSound.play(); this.finalTrigger.destroy();
        this.tweens.add({ targets: player, duration: 500, y: this.tpTube.getBounds().y });
        setTimeout(() => { playerBlocked = false; }, 500);
    }, 1100);
}

function drawStartScreen() {
    const screenCenterX = this.cameras.main.worldView.x + this.cameras.main.width / 2;
    this.add.rectangle(0, 0, screenWidth, screenHeight, 0x8585FF).setOrigin(0).depth = -1;

    let platform = this.add.tileSprite(0, screenHeight, screenWidth / 2, platformHeight, 'start-floorbricks').setScale(2).setOrigin(0, 0.5);
    this.physics.add.existing(platform); platform.body.immovable = true; platform.body.allowGravity = false;
    this.physics.add.collider(player, platform);

    this.add.image(screenWidth / 50, screenHeight / 3, 'cloud1').setScale(screenHeight / 1725);
    this.add.image(screenWidth / 25, screenHeight / 10, 'sign').setOrigin(0).setScale(screenHeight / 350);

    let propsY = screenHeight - platformHeight;
    this.add.image(screenWidth / 50, propsY, 'mountain2').setOrigin(0, 1).setScale(screenHeight / 517);
    this.add.image(screenWidth / 1.5, propsY, 'bush2').setOrigin(0, 1).setScale(screenHeight / 609);
    this.add.tileSprite(screenWidth / 15, propsY, 350, 35, 'fence').setOrigin(0, 1).setScale(screenHeight / 863);

    this.customBlock = this.add.sprite(screenCenterX, screenHeight - (platformHeight * 1.9),'custom-block').setScale(screenHeight / 345);
    this.customBlock.anims.play('custom-block-default')
    this.physics.add.collider(player, this.customBlock, function() {
        if (player.body.blocked.up) { if(typeof showSettings === 'function') showSettings.call(this); }
    }, null, this);
    this.physics.add.existing(this.customBlock); this.customBlock.body.allowGravity = false; this.customBlock.body.immovable = true;
    
    this.add.sprite(screenCenterX * 1.07, screenHeight - platformHeight, 'npc').setOrigin(0.5, 1).setScale(screenHeight / 365).anims.play('npc-default', true);
}

function raiseFlag() {
    if (flagRaised) { return false; }
    
    // Triggers positive reinforcement on the UI layer upon successful completion of the rehabilitation track.
    this.commandText.setText("🎉 مبروك! وصلت للهدف! 🎉");
    updateTextBg(this.commandText, this.commandBg);
    
    this.cameras.main.stopFollow();
    if(this.timeLeftText) this.timeLeftText.stopped = true;

    this.musicTheme.stop(); this.undergroundMusicTheme.stop(); this.hurryMusicTheme.stop();
    this.flagPoleSound.play();

    this.tweens.add({ targets: this.finalFlag, duration: 1000, y: screenHeight / 2.2 });
    setTimeout(() => { this.winSound.play(); }, 1000);
    
    flagRaised = true; playerBlocked = true;
    if(typeof addToScore === 'function') addToScore.call(this, 2000, player);

    setTimeout(() => { showResults(this); }, 2500);
    return false;
}
/*
-----------------------------------------------------------------------------
This represents the core evaluation logic of the session. It aggregates the 
tracked metrics to calculate overall session accuracy, average reaction time, 
and mean AI confidence. In Adaptive Mode, if the patient achieves a clinical 
accuracy threshold of 90% or higher across consecutive sessions, the system 
automatically increments their difficulty level via Local Storage. Finally, 
it systematically terminates the hardware camera connection and transmits the 
compiled data parameters to the analytics dashboard.

Outcome: Transforms raw gameplay inputs into objective, measurable clinical data, 
directly driving the automated progression system and safely releasing heavy 
hardware resources.
-----------------------------------------------------------------------------
*/
function showResults(scene) {
    
    const accuracyNum = totalCommands > 0 ? (correctGestures / totalCommands) * 100 : 0;
    
    const accuracy = accuracyNum.toFixed(1);
    const avgConfidence = confidenceCount > 0 ? (confidenceSum / confidenceCount).toFixed(2) : "0.00";
    const avgReaction = reactionTimes.length > 0 ? (reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length).toFixed(2) : "0.00";

    if (isAdaptiveMode) {
        if (accuracyNum >= 90) {
            
            successStreak++;
            localStorage.setItem('successStreak', successStreak);

            if (successStreak >= 2) {
                adaptiveLevel++; 
                localStorage.setItem('adaptiveLevel', adaptiveLevel);
                localStorage.setItem('successStreak', 0); 
                console.log("Level Up! New Level: " + adaptiveLevel);
            }
        } else {
            
            successStreak = 0;
            localStorage.setItem('successStreak', 0);
        }
    }

    setTimeout(async () => { 
    const baseUrl = "../index.html"; 
    
    if (isTutorialMode) {
        
        try {
            await fetch("http://127.0.0.1:8000/stop"); 
            console.log("Camera stopped successfully from game side");
        } catch (err) {
            console.error("Failed to stop camera:", err);
        }

        window.location.href = baseUrl + "?mode=finished_tutorial";
    } else {
        
        const params = new URLSearchParams({
            status: "gameover",
            mode: isAdaptiveMode ? "adaptive" : "normal", 
            level: isAdaptiveMode ? adaptiveLevel : "N/A",
            correct: `${correctGestures}/${totalCommands}`,
            acc: accuracy,
            conf: avgConfidence,
            time: avgReaction,
            wrong: wrongMoves
        });
        window.location.href = baseUrl + "?" + params.toString();
            }
        }, 500);
}

/*
-----------------------------------------------------------------------------
These functions govern the strict therapeutic prompting cycle. When a patient 
approaches an obstacle, the system locks the state, logs the exact timestamp, 
and prompts the required gesture visually. Upon successful physical execution, 
it immediately calculates the reaction time and increments the 
clinical success metrics.

Outcome: Establishes a highly accurate, timestamped record of the patient's 
response time for every individual physical command throughout 
the session.
-----------------------------------------------------------------------------
*/
function triggerCommand(scene, command, uiText) {
    currentCommand = command;
    commandActive = true;
    commandStartTime = Date.now();
    scene.commandText.setText(uiText);
    updateTextBg(scene.commandText, scene.commandBg);
    totalCommands++;
}

function registerCorrectGesture(scene) {
    const reaction = (Date.now() - commandStartTime) / 1000;
    reactionTimes.push(reaction); correctGestures++; confidenceSum += aiConfidence; confidenceCount++;
    commandActive = false;
    scene.commandText.setText("🌟 عمل رائع! 🌟");
    updateTextBg(scene.commandText, scene.commandBg);
}

/*
-----------------------------------------------------------------------------
Core Game Loop and AI Synchronization
The core update loop continuously optimizes browser memory by aggressively culling 
(destroying or disabling) physics objects and platforms that have passed behind 
the player. Furthermore, it actively scans the coordinates of upcoming obstacles 
to trigger the visual UI prompts at a precise safety distance. Finally, it maps 
the fetched AI gesture state ("Open" or "Close") directly to the character's 
physical velocity matrices.

Outcome: Ensures a highly optimized, memory-efficient game loop while flawlessly 
synchronizing the patient's physical actions with the on-screen digital mechanics.
-----------------------------------------------------------------------------
*/
function update(delta) {
    
    // 1. Dynamic Memory Management: Remove platforms that are now behind the player's camera view.
    this.platformGroup.getChildren().forEach(child => {
        if (child.x < player.x - screenWidth) {
            this.platformGroup.remove(child, true, true); 
        }
    });

    // Remove enemies (Goombas) that have fallen off-screen or passed behind the player.
    this.goombasGroup.getChildren().forEach(goomba => {
        if (goomba.x < player.x - screenWidth || goomba.y > screenHeight) {
            goomba.destroy();
        }
    });

    // 2. Physics Optimization: Disable collision detection and rendering for blocks far away from the player.
    // This prevents massive FPS drops during long adaptive levels.
    [this.blocksGroup, this.misteryBlocksGroup].forEach(group => {
        group.getChildren().forEach(block => {
            let distance = Math.abs(block.x - player.x);
            if (distance > screenWidth * 1.2) {
                block.body.enable = false; 
                block.visible = false;     
            } else {
                block.body.enable = true;  
                block.visible = true;
            }
        });
    });

    // Stop all logic updates if the game is in a non-playable state (e.g., paused or finished).
    if (gamePaused || gameOver || gameWinned || !player || playerBlocked) return;
    
    // 3. Fall Recovery Logic: If the patient fails a jump and falls into a hole.
    if (player.y >= screenHeight - 5) {
        wrongMoves++; // Log the physical execution error for clinical tracking.
        this.powerDownSound.play();
        
        // Reset player position safely backwards to try the jump again.
        player.y = screenHeight / 3;
        player.x = Math.max(screenWidth, player.x - (screenWidth * 0.4)); 
        player.setVelocity(0, 0);
        
        commandActive = false; // Reset the current command state.
        
        // Provide encouraging visual feedback after a failure.
        this.commandText.setText("❌ ركز وحاول مرة ثانية! ❌");
        updateTextBg(this.commandText, this.commandBg);
        
        // Grant temporary invulnerability to prevent immediate repeated deaths upon respawning.
        if(typeof applyPlayerInvulnerability === "function") applyPlayerInvulnerability.call(this, 2000);
        return;
    }

    // 4. Therapeutic Prompting System: Scan for upcoming hazards (holes).
    let closestObstacleDist = Infinity;
    
    // Throttle the scanning frequency to run every ~100ms instead of every single frame to save CPU.
    if (levelStarted && this.time.now % 100 < 16) { 
        for (let i = 0; i < worldHolesCoords.length; i++) {
            let hole = worldHolesCoords[i];
            let dist = hole.start - player.x;

            // Cleanup: Remove hole coordinates from the list once the player has successfully passed them.
            if (dist < -screenWidth) {
                worldHolesCoords.splice(i, 1);
                i--;
                continue;
            }

            // If a hole is within the critical 'WARNING_DISTANCE', trigger the "Close" (Jump) command.
            if (dist > 0 && dist < WARNING_DISTANCE) {
                closestObstacleDist = dist;
                
                // Only trigger if this is a new hole we haven't prompted for yet.
                if (lastObstacleX !== hole.start && !commandActive) {
                    triggerCommand(this, "Close", "⚠️ اغلق يدك للقفز ⚠️");
                    lastObstacleX = hole.start; 
                }
                break; // Stop scanning once the closest immediate threat is found.
            }
        }
        
        // Default State: If no obstacles are near, prompt the patient to maintain the "Open" (Run) gesture.
        if (closestObstacleDist === Infinity && !commandActive && currentCommand !== "Open") {
            triggerCommand(this, "Open", "🟢 افتح يدك للركض 🟢");
        }
    }

    // 5. AI to Physics Mapping: Apply the computer vision results to the game engine.
    
    // Strict clinical validation: Ignore any AI guesses that fall below the 70% confidence threshold.
    if (aiConfidence < 0.70) { aiGesture = "NoHand"; }
    
    const RUN_SPEED = playerController.speed.run * KIDS_SPEED_MULTIPLIER;
    const JUMP_POWER = velocityY * 1.3;

    // Execute "Open" Gesture Logic -> Move Character Forward.
    if (aiGesture === "Open") {
        player.setVelocityX(RUN_SPEED); 
        player.flipX = false;
        player.anims.play(playerState > 0 ? (playerState == 1 ? 'grown-mario-run' : 'fire-mario-run') : 'run', true);
        
        // If the current prompt was asking for "Open", record it as a clinical success.
        if (commandActive && currentCommand === "Open") registerCorrectGesture(this);
    }
    // Execute "Close" Gesture Logic -> Jump Action.
    else if (aiGesture === "Close") {
        // Apply a burst of horizontal speed during the jump to ensure clearing the gap.
        player.setVelocityX(RUN_SPEED * 1.8);
        
        // Only allow jumping if the player is currently touching the ground.
        if (player.body.blocked.down) {
            player.setVelocityY(-JUMP_POWER); 
            this.jumpSound.play();
            
            // If the current prompt was asking for "Close", record it as a clinical success.
            if (commandActive && currentCommand === "Close") registerCorrectGesture(this);
        }
    }
    // Idle State: If the AI sees no hand (or low confidence), stop the character completely.
    else {
        player.setVelocityX(0);
        player.anims.play(playerState > 0 ? (playerState == 1 ? 'grown-mario-idle' : 'fire-mario-idle') : 'idle', true);
    }

    // 6. Camera Follow Logic
    const playerVelocityX = player.body.velocity.x;
    const camera = this.cameras.main;

    // Start following the player once they move past the center of the initial screen.
    if (playerVelocityX > 0 && levelStarted && !reachedLevelEnd && !camera.isFollowing && player.x >= screenWidth * 1.5 && player.x >= (camera.worldView.x + camera.width / 2)) {
        camera.startFollow(player, true, 0.1, 0.05); 
        camera.isFollowing = true;
    }

    // Prevent backtracking: Stop the camera if the player is pushed backward (e.g., taking damage).
    if (playerVelocityX < 0 && furthestPlayerPos < player.x && levelStarted && !reachedLevelEnd && camera.isFollowing) {
        furthestPlayerPos = player.x;
        this.physics.world.setBounds(camera.worldView.x, 0, worldWidth, screenHeight);
        camera.setBounds(camera.worldView.x, 0, worldWidth, screenHeight);
        camera.stopFollow(); 
        camera.isFollowing = false;
    }

    // End of Level Trigger: Stop following when the player reaches the final designated area.
    if (!reachedLevelEnd && !isLevelOverworld && camera.isFollowing && player.x >= worldWidth - screenWidth * 1.5) {
        reachedLevelEnd = true; 
        camera.stopFollow();
    }
}