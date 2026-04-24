const goombasVelocityX = screenWidth / 19;

function createGoombas() {
    if (typeof isTutorialMode !== 'undefined' && isTutorialMode) {
        this.goombasGroup = this.add.group(); 
        return; 
    }

    this.goombasGroup = this.add.group();

    for (i = 0; i < Math.trunc(worldWidth / 3000); i++) {
        let x = generateRandomCoordinate(true);
        let goomba = this.physics.add.sprite(x, screenHeight - platformHeight, 'goomba').setOrigin(0.5, 1).setBounce(1, 0).setScale(screenHeight / 376);
        goomba.anims.play('goomba-walk', true);
        goomba.smoothed = true;
        goomba.depth = 2;
        if (Phaser.Math.Between(0, 10) <= 4) {
            goomba.setVelocityX(goombasVelocityX);
        } else {
            goomba.setVelocityX(-goombasVelocityX);
        }
        goomba.setMaxVelocity(goombasVelocityX, levelGravity);
        this.goombasGroup.add(goomba);
        
        let platformPieces = this.platformGroup.getChildren();
        this.physics.add.collider(goomba, platformPieces);
        let blocks = this.blocksGroup.getChildren();
        this.physics.add.collider(goomba, blocks);
        let misteryBlocks = this.misteryBlocksGroup.getChildren();
        this.physics.add.collider(goomba, misteryBlocks);
        let goombas = this.goombasGroup.getChildren();
        this.physics.add.collider(goomba, goombas);
        this.physics.add.collider(goomba, this.finalFlagMast);
        
        this.physics.add.overlap(player, goomba, checkGoombaCollision, null, this);
    }

    this.physics.add.collider(this.goombasGroup.getChildren(), this.immovableBlocksGroup.getChildren());
    this.physics.add.collider(this.goombasGroup.getChildren(), this.fallProtectionGroup.getChildren());
    this.physics.add.collider(this.goombasGroup.getChildren(), this.finalTrigger);

    setInterval(clearGoombas.call(this), 250);
}

function checkGoombaCollision(player, goomba) {
    if (goomba.dead || flagRaised) return;
    
    let goombaBeingStomped = player.body.touching.down && goomba.body.touching.up;

    if (goombaBeingStomped) {
        goomba.dead = true;
        goomba.anims.play('goomba-hurt', true);
        goomba.body.enable = false;
        this.goombasGroup.remove(goomba);
        this.goombaStompSound.play();
        player.setVelocityY(-velocityY / 1.5);
        if(typeof addToScore === 'function') addToScore.call(this, 100, goomba);
        
        this.tweens.add({ targets: goomba, duration: 300, alpha: 0, onComplete: () => goomba.destroy() });
        return;
    }
    
    if (!playerInvulnerable) { 
        wrongMoves++; 
        this.powerDownSound.play();
        
        if(typeof applyPlayerInvulnerability === 'function') applyPlayerInvulnerability.call(this, 2000); 

        if (typeof commandActive !== 'undefined') {
            commandActive = false; 
            if (this.commandText && this.commandBg) {
                this.commandText.setText("❌ ركز وحاول مرة ثانية! ❌"); 
                // 🌟 Update rounded box design when text changes
                if(typeof updateTextBg === 'function') updateTextBg(this.commandText, this.commandBg);
            }
        }
    }
}

function clearGoombas() {
    let goombas = this.goombasGroup.getChildren();

    for (let i = 0; i < goombas.length; i++) {
        if (goombas[i].body.velocity.x == 0 || (goombas[i].body.velocity.x > 0 && goombas[i].body.velocity.x != goombasVelocityX) || (goombas[i].body.velocity.x < 0 && goombas[i].body.velocity.x != -goombasVelocityX)) {
            this.goombasGroup.remove(goombas[i]);
            goombas[i].destroy();
        }
    }
}