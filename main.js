import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ============================================================================
// GAME CONFIGURATION
// ============================================================================
const CONFIG = {
    // Movement
    moveSpeed: 2.5,
    jumpForce: 12,
    gravity: 40,
    
    // Animation
    walkAnimationSpeed: 2.0, // Speed multiplier for walk animation
    
    // Camera
    cameraDistance: 3,
    cameraHeight: 2,
    cameraSensitivity: 0.002,
    
    // Character
    characterScale: 2, // Adjust if Snoopy is too small/big
    characterHeight: 1.0, // Height of character for collision
    
    // Collision
    collisionRadius: 0.3,
};

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
let scene, camera, renderer;
let snoopy, snoopyMixer, walkAction;
let museum;
let clock;

// Player state
const player = {
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: 0, // Y-axis rotation (horizontal)
    pitch: 0, // Camera pitch (vertical look)
    isGrounded: true,
    isMoving: false,
    hasJumped: false, // Prevents holding space to keep jumping
};

// Input state
const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
};

// Collision objects (meshes from the museum)
let collisionObjects = [];

// ============================================================================
// INITIALIZATION
// ============================================================================
async function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue
    scene.fog = new THREE.Fog(0x87ceeb, 20, 100);

    // Create camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Lighting
    setupLighting();

    // Clock for animations
    clock = new THREE.Clock();

    // Load models
    const loader = new GLTFLoader();
    
    try {
        // Load museum/theater scene from GitHub LFS
        const museumGLTF = await loader.loadAsync('https://media.githubusercontent.com/media/ryyanwang/joanne_val/main/scene.glb');
        museum = museumGLTF.scene;
        museum.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // Add to collision objects
                collisionObjects.push(child);
            }
        });
        scene.add(museum);
        console.log('Museum loaded successfully');

        // Load Snoopy from GitHub LFS
        const snoopyGLTF = await loader.loadAsync('https://media.githubusercontent.com/media/ryyanwang/joanne_val/main/snoopy-vr/source/snoopy%20(1).glb');
        snoopy = snoopyGLTF.scene;
        snoopy.scale.setScalar(CONFIG.characterScale);
        snoopy.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
            }
        });
        scene.add(snoopy);
        console.log('Snoopy loaded successfully');

        // Setup animations
        if (snoopyGLTF.animations && snoopyGLTF.animations.length > 0) {
            snoopyMixer = new THREE.AnimationMixer(snoopy);
            // Find walk animation
            const walkClip = snoopyGLTF.animations.find(
                (clip) => clip.name.toLowerCase().includes('walk')
            ) || snoopyGLTF.animations[0];
            
            walkAction = snoopyMixer.clipAction(walkClip);
            walkAction.setLoop(THREE.LoopRepeat);
            walkAction.timeScale = CONFIG.walkAnimationSpeed; // Speed up animation
            console.log('Walk animation ready:', walkClip.name);
        }

        // Find a good starting position
        findStartPosition();

        // Hide loading, show letter and buttons
        document.getElementById('loading').style.display = 'none';
        document.getElementById('letter-overlay').style.display = 'flex';
        document.getElementById('button-overlay').style.display = 'block';

    } catch (error) {
        console.error('Error loading models:', error);
        document.getElementById('loading').textContent = 'Error loading models: ' + error.message;
    }

    // Setup input handlers
    setupInput();

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Start game loop
    animate();
}

// ============================================================================
// LIGHTING SETUP
// ============================================================================
function setupLighting() {
    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    // Directional light (sun)
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(10, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 50;
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    scene.add(sun);

    // Hemisphere light for better ambient
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.4);
    scene.add(hemi);
}

// ============================================================================
// INPUT HANDLING
// ============================================================================
function setupInput() {
    // Keyboard
    document.addEventListener('keydown', (e) => {
        switch (e.code) {
            case 'KeyW': keys.forward = true; break;
            case 'KeyS': keys.backward = true; break;
            case 'KeyA': keys.left = true; break;
            case 'KeyD': keys.right = true; break;
            case 'Space': keys.jump = true; break;
        }
    });

    document.addEventListener('keyup', (e) => {
        switch (e.code) {
            case 'KeyW': keys.forward = false; break;
            case 'KeyS': keys.backward = false; break;
            case 'KeyA': keys.left = false; break;
            case 'KeyD': keys.right = false; break;
            case 'Space': keys.jump = false; break;
        }
    });

    // Pointer lock for mouse control
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === document.body) {
            document.getElementById('info').style.display = 'block';
            document.getElementById('crosshair').style.display = 'block';
        } else {
            document.getElementById('info').style.display = 'none';
            document.getElementById('crosshair').style.display = 'none';
        }
    });

    // Mouse movement
    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement !== document.body) return;

        // Horizontal rotation (yaw)
        player.rotation -= e.movementX * CONFIG.cameraSensitivity;

        // Vertical rotation (pitch) - clamped (inverted: mouse up = look up)
        player.pitch += e.movementY * CONFIG.cameraSensitivity;
        player.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, player.pitch));
    });
}

// ============================================================================
// FIND STARTING POSITION
// ============================================================================
function findStartPosition() {
    // Try to find a good starting position INSIDE the theatre
    // Raycast down from a low position to find the floor inside
    const raycaster = new THREE.Raycaster();
    
    // Try multiple positions to find one inside the theatre
    const testPositions = [
        new THREE.Vector3(0, 5, 0),    // Center, low
        new THREE.Vector3(0, 2, 0),    // Even lower
        new THREE.Vector3(0, 0, 0),    // Ground level
        new THREE.Vector3(0, -5, 0),   // Below ground (theatre might be below origin)
    ];
    
    for (const testPos of testPositions) {
        raycaster.set(testPos, new THREE.Vector3(0, -1, 0));
        const intersects = raycaster.intersectObjects(collisionObjects, true);
        
        if (intersects.length > 0) {
            player.position.copy(intersects[0].point);
            player.position.y += 0.1; // Small offset above ground
            console.log('Found floor at:', player.position);
            return;
        }
    }
    
    // If no floor found with downward rays, try upward from below
    raycaster.set(new THREE.Vector3(0, -50, 0), new THREE.Vector3(0, 1, 0));
    const intersects = raycaster.intersectObjects(collisionObjects, true);
    
    if (intersects.length > 0) {
        player.position.copy(intersects[0].point);
        player.position.y += 0.1;
        console.log('Found floor from below at:', player.position);
        return;
    }
    
    // Default position if no ground found - try center of scene
    player.position.set(0, 0, 0);
    console.log('Using default starting position:', player.position);
}

// ============================================================================
// COLLISION DETECTION
// ============================================================================
function checkCollision(newPosition) {
    const raycaster = new THREE.Raycaster();
    
    // Check collision in movement direction
    const directions = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, -1),
    ];
    
    for (const dir of directions) {
        raycaster.set(
            new THREE.Vector3(newPosition.x, newPosition.y + CONFIG.characterHeight / 2, newPosition.z),
            dir
        );
        raycaster.far = CONFIG.collisionRadius;
        
        const intersects = raycaster.intersectObjects(collisionObjects, true);
        if (intersects.length > 0) {
            // Push back from collision
            const pushback = dir.clone().multiplyScalar(-(CONFIG.collisionRadius - intersects[0].distance));
            newPosition.add(pushback);
        }
    }
    
    return newPosition;
}

function checkGround() {
    const raycaster = new THREE.Raycaster();
    raycaster.set(
        new THREE.Vector3(player.position.x, player.position.y + 0.5, player.position.z),
        new THREE.Vector3(0, -1, 0)
    );
    raycaster.far = 1.0;
    
    const intersects = raycaster.intersectObjects(collisionObjects, true);
    
    if (intersects.length > 0) {
        const groundY = intersects[0].point.y;
        const distanceToGround = player.position.y - groundY;
        
        // If close to ground and falling or on ground
        if (distanceToGround <= 0.15 && player.velocity.y <= 0) {
            player.position.y = groundY + 0.01;
            player.velocity.y = 0;
            player.isGrounded = true;
            return;
        }
    }
    
    // Only mark as not grounded if we're clearly in the air
    if (player.velocity.y > 0 || !intersects.length) {
        player.isGrounded = false;
    }
}

// ============================================================================
// UPDATE PLAYER
// ============================================================================
function updatePlayer(delta) {
    // Calculate movement direction based on input
    const moveDirection = new THREE.Vector3();
    
    if (keys.forward) moveDirection.z -= 1;
    if (keys.backward) moveDirection.z += 1;
    if (keys.left) moveDirection.x -= 1;
    if (keys.right) moveDirection.x += 1;
    
    // Check if player is moving
    player.isMoving = moveDirection.lengthSq() > 0;
    
    if (player.isMoving) {
        // Normalize and rotate by player's facing direction
        moveDirection.normalize();
        moveDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation);
        
        // Apply movement
        player.velocity.x = moveDirection.x * CONFIG.moveSpeed;
        player.velocity.z = moveDirection.z * CONFIG.moveSpeed;
    } else {
        // Decelerate when not moving
        player.velocity.x *= 0.9;
        player.velocity.z *= 0.9;
    }
    
    // Jump
    if (keys.jump && player.isGrounded) {
        player.velocity.y = CONFIG.jumpForce;
        player.isGrounded = false;
        keys.jump = false; // Reset immediately to prevent double jump
    }
    
    // Apply gravity
    if (!player.isGrounded) {
        player.velocity.y -= CONFIG.gravity * delta;
    }
    
    // Calculate new position
    const newPosition = player.position.clone();
    newPosition.x += player.velocity.x * delta;
    newPosition.y += player.velocity.y * delta;
    newPosition.z += player.velocity.z * delta;
    
    // Check collisions
    const collisionChecked = checkCollision(newPosition);
    player.position.copy(collisionChecked);
    
    // Check ground
    checkGround();
    
    // Prevent falling through floor
    if (player.position.y < -10) {
        player.position.set(0, 5, 0);
        player.velocity.set(0, 0, 0);
    }
}

// ============================================================================
// UPDATE CHARACTER AND CAMERA
// ============================================================================
function updateCharacter() {
    if (!snoopy) return;
    
    // Update Snoopy position and rotation
    // Add Math.PI to flip Snoopy to face away from camera
    snoopy.position.copy(player.position);
    snoopy.rotation.y = player.rotation + Math.PI;
    
    // Handle walk animation
    if (snoopyMixer && walkAction) {
        if (player.isMoving && player.isGrounded) {
            if (!walkAction.isRunning()) {
                walkAction.play();
            }
        } else {
            if (walkAction.isRunning()) {
                walkAction.fadeOut(0.2);
                setTimeout(() => {
                    walkAction.stop();
                    walkAction.reset();
                }, 200);
            }
        }
    }
}

function updateCamera() {
    if (!snoopy) return;
    
    // Calculate desired camera position (behind and above character)
    const cameraOffset = new THREE.Vector3(
        Math.sin(player.rotation) * CONFIG.cameraDistance,
        CONFIG.cameraHeight + Math.sin(player.pitch) * CONFIG.cameraDistance,
        Math.cos(player.rotation) * CONFIG.cameraDistance
    );
    
    // Desired camera position
    const desiredCameraPos = player.position.clone().add(cameraOffset);
    
    // Camera collision - raycast from player to desired camera position
    const raycaster = new THREE.Raycaster();
    const playerHead = player.position.clone();
    playerHead.y += CONFIG.characterHeight;
    
    const direction = desiredCameraPos.clone().sub(playerHead).normalize();
    const distance = playerHead.distanceTo(desiredCameraPos);
    
    raycaster.set(playerHead, direction);
    raycaster.far = distance;
    
    const intersects = raycaster.intersectObjects(collisionObjects, true);
    
    if (intersects.length > 0) {
        // Camera would clip through something - move it closer
        const safeDistance = intersects[0].distance - 0.2; // Small buffer
        if (safeDistance > 0.5) {
            camera.position.copy(playerHead).add(direction.multiplyScalar(safeDistance));
        } else {
            // Too close to wall - position camera at player head
            camera.position.copy(playerHead);
        }
    } else {
        // No collision - use desired position
        camera.position.copy(desiredCameraPos);
    }
    
    // Look at player (slightly above ground level)
    const lookTarget = player.position.clone();
    lookTarget.y += CONFIG.characterHeight;
    camera.lookAt(lookTarget);
}

// ============================================================================
// ANIMATION LOOP
// ============================================================================
function animate() {
    requestAnimationFrame(animate);
    
    const delta = Math.min(clock.getDelta(), 0.1); // Cap delta to prevent huge jumps
    
    // Update animations
    if (snoopyMixer) {
        snoopyMixer.update(delta);
    }
    
    // Update game
    if (snoopy && document.pointerLockElement === document.body) {
        updatePlayer(delta);
        updateCharacter();
    }
    updateCamera();
    
    // Render
    renderer.render(scene, camera);
}

// ============================================================================
// WINDOW RESIZE
// ============================================================================
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================================
// START GAME
// ============================================================================
init();
