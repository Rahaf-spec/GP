const goombasVelocityX = screenWidth / 19;

function createGoombas() {
    // 1. إنشاء المجموعة أولاً في كل الحالات لتجنب أخطاء الكود في الدوال الأخرى
    this.goombasGroup = this.add.group();

    // 2. إذا كنا في مود التتوريال، نخرج فوراً ولا ننشئ أي وحش
    if (typeof isTutorialMode !== 'undefined' && isTutorialMode) {
        return; 
    }

    // 3. تحديد عدد الوحوش بناءً على المود
    let enemiesCount;
    if (typeof isAdaptiveMode !== 'undefined' && isAdaptiveMode) {
        // في المود التكيفي: عدد الوحوش = المستوى الحالي + 1 (يمكنك تغيير المعادلة حسب الرغبة)
        enemiesCount = adaptiveLevel + 1;
    } else {
        // المود العادي: نستخدم الحسبة الأصلية بناءً على طول العالم
        enemiesCount = Math.trunc(worldWidth / 3000);
    }

    // 4. حلقة إنشاء الوحوش
    for (let i = 0; i < enemiesCount; i++) {
        let x = generateRandomCoordinate(true);
        let goomba = this.physics.add.sprite(x, screenHeight - platformHeight, 'goomba')
            .setOrigin(0.5, 1)
            .setBounce(1, 0)
            .setScale(screenHeight / 376);
            
        goomba.anims.play('goomba-walk', true);
        goomba.smoothed = true;
        goomba.depth = 2;

        // تحديد الاتجاه العشوائي
        let velocityX = (typeof goombasVelocityX !== 'undefined') ? goombasVelocityX : 100; // قيمة احتياطية
        if (Phaser.Math.Between(0, 10) <= 4) {
            goomba.setVelocityX(velocityX);
        } else {
            goomba.setVelocityX(-velocityX);
        }

        goomba.setMaxVelocity(velocityX, levelGravity);
        this.goombasGroup.add(goomba);
        
        // إعداد التصادمات للوحش الجديد
        this.physics.add.collider(goomba, this.platformGroup.getChildren());
        this.physics.add.collider(goomba, this.blocksGroup.getChildren());
        this.physics.add.collider(goomba, this.misteryBlocksGroup.getChildren());
        this.physics.add.collider(goomba, this.goombasGroup.getChildren());
        if (this.finalFlagMast) this.physics.add.collider(goomba, this.finalFlagMast);
        
        this.physics.add.overlap(player, goomba, checkGoombaCollision, null, this);
    }

    // 5. إعداد التصادمات الجماعية للمجموعة
    this.physics.add.collider(this.goombasGroup.getChildren(), this.immovableBlocksGroup.getChildren());
    this.physics.add.collider(this.goombasGroup.getChildren(), this.fallProtectionGroup.getChildren());
    if (this.finalTrigger) this.physics.add.collider(this.goombasGroup.getChildren(), this.finalTrigger);


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