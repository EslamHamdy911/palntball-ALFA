const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// === إعداد الصوت ===
const bgMusic = new Audio('music.mp3'); 
bgMusic.loop = true; 
bgMusic.volume = 0.5;

let width, height;
function resize() {
    width = window.innerWidth; 
    height = window.innerHeight;
    canvas.width = width; 
    canvas.height = height;
}
window.addEventListener('resize', resize); 
resize();

// === حالة اللعبة ===
let gameState = 'START'; 
let frame = 0;
let kills = 0;
let shake = 0;

// === اللاعب ===
const player = {
    x: 0, y: 0, radius: 15, angle: 0,
    hp: 100, maxHp: 100,
    speed: 4,
    level: 1, xp: 0, nextLevelXp: 100,
    // خصائص السلاح
    bulletDmg: 20,
    bulletSpeed: 12,
    fireRate: 20, 
    bulletCount: 1, 
    spread: 0.1,
    pierce: 0 
};

// المصفوفات
let enemies = [];
let bullets = [];
let particles = [];
let items = []; // مصفوفة جديدة للأغراض التي تسقط
let damageTexts = [];

// === المدخلات ===
const input = {
    active: false,
    sx: 0, sy: 0, 
    cx: 0, cy: 0, 
    dx: 0, dy: 0, 
    id: null
};

// ========================
// نظام الغنائم (Pickups System)
// ========================
const lootTypes = [
    { id: 'heal', color: '#00ff00', text: '❤️ HP UP', chance: 0.1, apply: () => { player.hp = Math.min(player.maxHp, player.hp + 30); } },
    { id: 'dmg', color: '#ff0000', text: '⚡ DMG UP', chance: 0.05, apply: () => { player.bulletDmg += 5; } },
    { id: 'multi', color: '#00ffff', text: '🔫 MULTI', chance: 0.03, apply: () => { player.bulletCount++; player.spread += 0.05; } },
    { id: 'speed', color: '#ffff00', text: '🔥 SPEED', chance: 0.05, apply: () => { player.fireRate = Math.max(5, player.fireRate - 2); } }
];

class ItemDrop {
    constructor(x, y) {
        this.x = x; 
        this.y = y;
        this.radius = 8;
        this.magnet = false;
        
        // اختيار نوع الغرض عشوائياً
        let rand = Math.random();
        // النوع الافتراضي هو خبرة (XP)
        this.type = 'xp'; 
        this.color = '#ffd700'; // ذهبي للخبرة
        
        // التحقق هل يسقط سلاح أو علاج؟
        for(let loot of lootTypes) {
            if(Math.random() < loot.chance) {
                this.type = loot;
                this.color = loot.color;
                this.radius = 12; // الغرض المهم أكبر حجماً
                break;
            }
        }
    }

    update() {
        // المغناطيس عند الاقتراب
        let dx = player.x - this.x; 
        let dy = player.y - this.y;
        let dist = Math.hypot(dx, dy);
        
        if(dist < 150) this.magnet = true;
        
        if(this.magnet) {
            this.x += (dx/dist) * 10;
            this.y += (dy/dist) * 10;
        }

        // التقاط الغرض
        if(dist < player.radius + this.radius) {
            if(this.type === 'xp') {
                // زيادة الخبرة
                player.xp += 10;
                checkLevelUp();
            } else {
                // تطبيق الترقية الخاصة
                this.type.apply();
                createFloatingText(player.x, player.y - 40, this.type.text, this.type.color, 20);
                createParticles(player.x, player.y, this.color, 15);
            }
            return true; // تم الالتقاط
        }
        return false;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.shadowBlur = 10; ctx.shadowColor = this.color; ctx.fillStyle = this.color;
        
        if(this.type === 'xp') {
            ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI*2); ctx.fill();
        } else {
            // رسم مربع دوار للأغراض المميزة
            ctx.rotate(frame * 0.1);
            ctx.fillRect(-6, -6, 12, 12);
        }
        ctx.restore();
    }
}

// ========================
// الكلاسات
// ========================
class Enemy {
    constructor(type) {
        this.type = type; // 0:Chaser, 1:Tank, 2:Shooter
        let angle = Math.random() * Math.PI * 2;
        let dist = Math.max(width, height) * 0.8;
        this.x = player.x + Math.cos(angle) * dist;
        this.y = player.y + Math.sin(angle) * dist;
        
        // زيادة الصعوبة مع المستوى
        let scaling = player.level * 0.1;

        if(type === 0) { // Chaser
            this.hp = 30 + (player.level * 5);
            this.speed = 3 + Math.random();
            this.radius = 12; this.color = '#ff0055';
        } else if (type === 1) { // Tank
            this.hp = 100 + (player.level * 20);
            this.speed = 1.5;
            this.radius = 25; this.color = '#ffaa00';
        } else { // Shooter
            this.hp = 40 + (player.level * 8);
            this.speed = 2;
            this.radius = 15; this.color = '#aa00ff';
            this.shootTimer = 0;
        }
    }

    update() {
        let dx = player.x - this.x;
        let dy = player.y - this.y;
        let dist = Math.hypot(dx, dy);
        let angle = Math.atan2(dy, dx);

        if(this.type === 2) { 
            if(dist > 250) { this.x += Math.cos(angle)*this.speed; this.y += Math.sin(angle)*this.speed; } 
            else if (dist < 150) { this.x -= Math.cos(angle)*this.speed; this.y -= Math.sin(angle)*this.speed; }
            this.shootTimer++;
            if(this.shootTimer > 100) {
                this.shootTimer = 0;
                bullets.push({ x: this.x, y: this.y, vx: Math.cos(angle)*6, vy: Math.sin(angle)*6, color: '#aa00ff', owner: 'enemy', dmg: 10, radius: 4, life: 100 });
            }
        } else { 
            this.x += Math.cos(angle) * this.speed;
            this.y += Math.sin(angle) * this.speed;
            if(dist < this.radius + player.radius) {
                player.hp -= 0.5;
                createParticles(this.x, this.y, '#f00', 1);
                shake = 5;
            }
        }
    }

    draw() {
        ctx.save(); ctx.translate(this.x, this.y);
        ctx.fillStyle = this.color; ctx.shadowBlur = 10; ctx.shadowColor = this.color;
        if(this.type === 1) ctx.fillRect(-this.radius, -this.radius, this.radius*2, this.radius*2);
        else if (this.type === 2) { ctx.rotate(Math.atan2(player.y - this.y, player.x - this.x)); ctx.beginPath(); ctx.moveTo(15,0); ctx.lineTo(-10, 10); ctx.lineTo(-10, -10); ctx.fill(); } 
        else { ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI*2); ctx.fill(); }
        ctx.restore();
    }
}

class FloatingText {
    constructor(x, y, text, color, size) {
        this.x = x; this.y = y; this.text = text; this.color = color; this.size = size;
        this.life = 60; this.vy = -1;
    }
    update() { this.y += this.vy; this.life--; return this.life <= 0; }
    draw() {
        ctx.globalAlpha = this.life / 60; ctx.fillStyle = this.color; ctx.font = `bold ${this.size}px monospace`;
        ctx.fillText(this.text, this.x, this.y); ctx.globalAlpha = 1;
    }
}

// ========================
// الوظائف المساعدة
// ========================
function createParticles(x, y, color, count) {
    for(let i=0; i<count; i++) particles.push({x, y, vx:(Math.random()-0.5)*10, vy:(Math.random()-0.5)*10, life:1, color});
}

function createFloatingText(x, y, text, color, size=14) {
    damageTexts.push(new FloatingText(x + (Math.random()*20-10), y, text, color, size));
}

function checkLevelUp() {
    if(player.xp >= player.nextLevelXp) {
        player.xp -= player.nextLevelXp;
        player.level++;
        player.nextLevelXp = Math.floor(player.nextLevelXp * 1.2);
        createFloatingText(player.x, player.y - 50, "LEVEL UP!", '#ffd700', 30);
        document.getElementById('lvl-txt').innerText = player.level;
        // زيادة الصحة القصوى قليلاً كجائزة
        player.maxHp += 10;
        player.hp += 10;
    }
    updateUi();
}

function updateUi() {
    let xpPerc = (player.xp / player.nextLevelXp) * 100;
    document.getElementById('xp-fill').style.width = xpPerc + "%";
    let hpPerc = (player.hp / player.maxHp) * 100;
    document.getElementById('hp-fill').style.width = hpPerc + "%";
    document.getElementById('kill-count').innerText = kills;
}

function playSound() {
    // محاولة تشغيل الصوت (يجب أن تكون داخل حدث مستخدم)
    bgMusic.play().then(() => {
        // الصوت يعمل
    }).catch(error => {
        console.log("Audio autoplay prevented by browser. Interaction needed.");
    });
}

// ========================
// الحلقة الرئيسية
// ========================
function startGame() {
    document.getElementById('start-screen').style.display = 'none';
    
    // تشغيل الصوت هنا لأن هذا الزر هو تفاعل مستخدم
    playSound();

    player.x = width/2; player.y = height/2;
    player.hp = 100; player.level = 1; player.xp = 0;
    
    // إعادة تعيين السلاح للقوة الافتراضية
    player.bulletDmg = 20; player.fireRate = 20; player.bulletCount = 1; player.spread = 0.1;

    enemies = []; bullets = []; items = [];
    gameState = 'PLAY';
    loop();
}

function loop() {
    requestAnimationFrame(loop);
    if(gameState !== 'PLAY') return;
    frame++;

    // مسح الشاشة
    ctx.fillStyle = 'rgba(5, 5, 5, 0.3)'; ctx.fillRect(0, 0, width, height);
    
    // اهتزاز
    ctx.save();
    if(shake > 0) { ctx.translate((Math.random()-0.5)*shake, (Math.random()-0.5)*shake); shake *= 0.9; }

    // 1. Spawner
    let maxEnemies = 5 + player.level * 2;
    if(enemies.length < maxEnemies) {
        let type = 0; 
        if(player.level > 2 && Math.random() < 0.2) type = 2; // Shooter
        if(player.level > 4 && Math.random() < 0.1) type = 1; // Tank
        enemies.push(new Enemy(type));
    }

    // 2. Player Movement
    if(input.active) {
        player.x += input.dx * player.speed;
        player.y += input.dy * player.speed;
        player.x = Math.max(20, Math.min(width-20, player.x));
        player.y = Math.max(20, Math.min(height-20, player.y));

        // Auto Fire
        if(frame % player.fireRate === 0) {
            let nearest = null, minDist = 9999;
            enemies.forEach(e => {
                let d = Math.hypot(e.x - player.x, e.y - player.y);
                if(d < minDist) { minDist = d; nearest = e; }
            });
            
            let targetAngle = input.dy || input.dx ? Math.atan2(input.dy, input.dx) : 0;
            if(nearest && minDist < 400) targetAngle = Math.atan2(nearest.y - player.y, nearest.x - player.x);

            for(let i=0; i<player.bulletCount; i++) {
                let offset = (i - (player.bulletCount-1)/2) * player.spread;
                bullets.push({
                    x: player.x, y: player.y, 
                    vx: Math.cos(targetAngle+offset)*player.bulletSpeed, vy: Math.sin(targetAngle+offset)*player.bulletSpeed, 
                    color: '#00f3ff', owner: 'player', dmg: player.bulletDmg, radius: 4, life: 100, pierce: player.pierce
                });
            }
        }
    }

    // Draw Player
    ctx.shadowBlur = 15; ctx.shadowColor = '#00f3ff'; ctx.fillStyle = '#00f3ff';
    ctx.beginPath(); ctx.arc(player.x, player.y, player.radius, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;

    // 3. Updates
    items = items.filter(i => { i.draw(); return !i.update(); }); // تحديث ورسم الأغراض
    damageTexts = damageTexts.filter(t => { t.draw(); return !t.update(); });

    for(let i=particles.length-1; i>=0; i--) {
        let p = particles[i]; p.x += p.vx; p.y += p.vy; p.life -= 0.05;
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1; if(p.life<=0) particles.splice(i,1);
    }

    enemies.forEach(e => { e.update(); e.draw(); });

    for(let i=bullets.length-1; i>=0; i--) {
        let b = bullets[i]; b.x += b.vx; b.y += b.vy; b.life--;
        ctx.fillStyle = b.color; ctx.shadowBlur = 5; ctx.shadowColor = b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
        
        if(b.x<0||b.x>width||b.y<0||b.y>height||b.life<=0) { bullets.splice(i,1); continue; }

        if(b.owner === 'player') {
            for(let j=enemies.length-1; j>=0; j--) {
                let e = enemies[j];
                if(Math.hypot(b.x-e.x, b.y-e.y) < b.radius + e.radius) {
                    e.hp -= b.dmg;
                    createFloatingText(e.x, e.y, b.dmg, '#fff');
                    createParticles(e.x, e.y, b.color, 3);
                    if(e.hp <= 0) {
                        // إسقاط غرض عند الموت
                        items.push(new ItemDrop(e.x, e.y));
                        createParticles(e.x, e.y, e.color, 10);
                        enemies.splice(j, 1);
                        kills++; shake = 5;
                    }
                    if(b.pierce > 0) b.pierce--; else bullets.splice(i,1);
                    break;
                }
            }
        } else { 
            if(Math.hypot(b.x-player.x, b.y-player.y) < b.radius + player.radius) {
                player.hp -= b.dmg;
                createFloatingText(player.x, player.y, "-"+b.dmg, '#f00', 18);
                shake = 10;
                createParticles(player.x, player.y, '#f00', 5);
                bullets.splice(i,1);
            }
        }
    }

    updateUi();
    if(player.hp <= 0) {
        gameState = 'OVER';
        document.getElementById('final-score').innerText = kills;
        document.getElementById('final-level').innerText = player.level;
        document.getElementById('game-over-screen').style.display = 'flex';
    }

    // Joystick
    if(input.active) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(input.sx, input.sy, 50, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = 'rgba(0, 243, 255, 0.5)';
        ctx.beginPath(); ctx.arc(input.cx, input.cy, 20, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
}

// === تحكم اللمس ===
window.addEventListener('touchstart', e => {
    if(e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    if(!input.active && gameState === 'PLAY') {
        let t = e.changedTouches[0];
        input.active = true; input.id = t.identifier;
        input.sx = t.clientX; input.sy = t.clientY;
        input.cx = t.clientX; input.cy = t.clientY;
    }
}, {passive: false});

window.addEventListener('touchmove', e => {
    if(gameState !== 'PLAY') return;
    e.preventDefault();
    for(let i=0; i<e.changedTouches.length; i++) {
        if(e.changedTouches[i].identifier === input.id) {
            let t = e.changedTouches[i];
            let dx = t.clientX - input.sx; let dy = t.clientY - input.sy;
            let dist = Math.min(50, Math.hypot(dx, dy));
            let angle = Math.atan2(dy, dx);
            input.cx = input.sx + Math.cos(angle) * dist;
            input.cy = input.sy + Math.sin(angle) * dist;
            input.dx = Math.cos(angle) * (dist/50);
            input.dy = Math.sin(angle) * (dist/50);
        }
    }
}, {passive: false});

window.addEventListener('touchend', e => {
    for(let i=0; i<e.changedTouches.length; i++) {
        if(e.changedTouches[i].identifier === input.id) {
            input.active = false; input.dx = 0; input.dy = 0;
        }
    }
});
