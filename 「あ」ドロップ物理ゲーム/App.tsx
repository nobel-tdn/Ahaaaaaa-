
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AhChar } from './types';
import {
  GRAVITY,
  FLOOR_FRICTION,
  BOUNCE_FACTOR,
  MIN_VELOCITY_TO_SETTLE,
  SETTLE_THRESHOLD_Y,
  INITIAL_VX_MIN,
  INITIAL_VX_MAX,
  INITIAL_ROTATION_SPEED_MIN,
  INITIAL_ROTATION_SPEED_MAX,
  CHAR_TEXT,
  CHAR_FONT_SIZE_MIN,
  CHAR_FONT_SIZE_MAX,
  CHAR_COLORS
} from './constants';

const App: React.FC = () => {
  const [ahs, setAhs] = useState<AhChar[]>([]);
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const [gameDimensions, setGameDimensions] = useState({ width: 0, height: 0 });
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const updateDimensions = () => {
      if (gameAreaRef.current) {
        setGameDimensions({
          width: gameAreaRef.current.clientWidth,
          height: gameAreaRef.current.clientHeight,
        });
      }
    };

    if (isClient) {
      updateDimensions();
      window.addEventListener('resize', updateDimensions);
    }
    
    return () => {
      if (isClient) {
        window.removeEventListener('resize', updateDimensions);
      }
    };
  }, [isClient]);

  const addAhCharacter = useCallback(() => {
    if (gameDimensions.width === 0 || gameDimensions.height === 0) {
      return;
    }

    const newSize = Math.random() * (CHAR_FONT_SIZE_MAX - CHAR_FONT_SIZE_MIN) + CHAR_FONT_SIZE_MIN;
    const spawnX = (gameDimensions.width / 2) - (newSize / 2) + (Math.random() - 0.5) * (gameDimensions.width / 4);

    const newAh: AhChar = {
      id: `ah-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      char: CHAR_TEXT,
      x: Math.max(0, Math.min(spawnX, gameDimensions.width - newSize)),
      y: -newSize,
      vx: Math.random() * (INITIAL_VX_MAX - INITIAL_VX_MIN) + INITIAL_VX_MIN,
      vy: Math.random() * 2,
      rotation: Math.random() * 360,
      rotationSpeed: Math.random() * (INITIAL_ROTATION_SPEED_MAX - INITIAL_ROTATION_SPEED_MIN) + INITIAL_ROTATION_SPEED_MIN,
      size: newSize,
      color: CHAR_COLORS[Math.floor(Math.random() * CHAR_COLORS.length)],
      settled: false,
    };
    setAhs(prevAhs => [...prevAhs, newAh]);
  }, [gameDimensions]); // ahs.length dependency removed

  useEffect(() => {
    if (gameDimensions.width === 0 || gameDimensions.height === 0) return;

    let animationFrameId: number;

    const updatePhysics = () => {
      setAhs(prevAhs => {
        const updatedAhs = prevAhs.map(ah => {
          if (ah.settled) return { ...ah }; // Return a new object to ensure React detects changes if needed later

          let newVx = ah.vx;
          let newVy = ah.vy + GRAVITY;
          let newX = ah.x + newVx;
          let newY = ah.y + newVy;
          let newRotation = ah.rotation + ah.rotationSpeed;
          let isSettled = ah.settled;

          // Floor collision and settling
          if (newY + ah.size > gameDimensions.height) {
            newY = gameDimensions.height - ah.size;
            newVy *= -BOUNCE_FACTOR;
            newVx *= FLOOR_FRICTION;
            ah.rotationSpeed *= FLOOR_FRICTION;

            if (Math.abs(newVy) < MIN_VELOCITY_TO_SETTLE && newY >= gameDimensions.height - ah.size - SETTLE_THRESHOLD_Y) {
              newVy = 0;
              if (Math.abs(newVx) < MIN_VELOCITY_TO_SETTLE / 2) newVx = 0;
              if (Math.abs(ah.rotationSpeed) < 0.1) ah.rotationSpeed = 0;
              if (newVx === 0 && newVy === 0 && ah.rotationSpeed === 0) isSettled = true;
            }
          }

          // Wall collisions
          if (newX < 0) {
            newX = 0;
            newVx *= -BOUNCE_FACTOR;
          } else if (newX + ah.size > gameDimensions.width) {
            newX = gameDimensions.width - ah.size;
            newVx *= -BOUNCE_FACTOR;
          }

          // Ceiling collision
          if (newY < 0 && ah.vy < 0) {
            newY = 0;
            newVy *= -BOUNCE_FACTOR;
          }
          
          const MAX_SPEED = 15;
          newVx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, newVx));
          newVy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, newVy));

          return {
            ...ah,
            x: newX,
            y: newY,
            vx: newVx,
            vy: newVy,
            rotation: newRotation,
            settled: isSettled, // Pass through settled state initially
          };
        });

        // Character-to-character collision
        for (let i = 0; i < updatedAhs.length; i++) {
          if (updatedAhs[i].settled) continue;

          for (let j = i + 1; j < updatedAhs.length; j++) {
            // Settled characters don't initiate collisions but can be collided with
            // if (updatedAhs[j].settled) continue; // If we want settled chars to be completely static

            const ah1 = updatedAhs[i];
            const ah2 = updatedAhs[j];

            const dx = (ah1.x + ah1.size / 2) - (ah2.x + ah2.size / 2);
            const dy = (ah1.y + ah1.size / 2) - (ah2.y + ah2.size / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);
            const combinedRadii = (ah1.size / 2) + (ah2.size / 2);

            if (distance < combinedRadii) {
              // Collision detected
              const overlap = combinedRadii - distance;
              
              // Normalize collision vector
              const nx = dx / distance;
              const ny = dy / distance;

              // Separate them to prevent sticking
              const separationFactor = 0.5; // How much to move each object
              if (!ah1.settled) {
                ah1.x += nx * overlap * (ah2.settled ? 1 : separationFactor);
                ah1.y += ny * overlap * (ah2.settled ? 1 : separationFactor);
              }
              if (!ah2.settled) {
                ah2.x -= nx * overlap * (ah1.settled ? 1 : separationFactor);
                ah2.y -= ny * overlap * (ah1.settled ? 1 : separationFactor);
              }
              
              // Relative velocity
              const rvx = ah1.vx - ah2.vx;
              const rvy = ah1.vy - ah2.vy;

              // Dot product of relative velocity and normal
              const velAlongNormal = rvx * nx + rvy * ny;

              // Do not resolve if velocities are separating
              if (velAlongNormal > 0) continue;

              // Calculate impulse scalar (elastic collision)
              // Using sizes as a proxy for mass (mass = size)
              const m1 = ah1.size;
              const m2 = ah2.size;
              const restitution = 0.7; // Bounciness between characters

              let impulse = -(1 + restitution) * velAlongNormal;
              if (ah1.settled && !ah2.settled) { // ah1 is static, ah2 collides
                 impulse /= (1 / m2);
                 ah2.vx += (impulse / m2) * nx;
                 ah2.vy += (impulse / m2) * ny;
              } else if (!ah1.settled && ah2.settled) { // ah2 is static, ah1 collides
                 impulse /= (1 / m1);
                 ah1.vx -= (impulse / m1) * nx;
                 ah1.vy -= (impulse / m1) * ny;
              } else if (!ah1.settled && !ah2.settled) { // both are dynamic
                 impulse /= (1 / m1 + 1 / m2);
                 // Apply impulse
                 const impulseX1 = (impulse / m1) * nx;
                 const impulseY1 = (impulse / m1) * ny;
                 const impulseX2 = (impulse / m2) * nx;
                 const impulseY2 = (impulse / m2) * ny;

                 ah1.vx += impulseX1;
                 ah1.vy += impulseY1;
                 ah2.vx -= impulseX2;
                 ah2.vy -= impulseY2;
              }
              
              // Slightly increase rotation on collision for visual effect
              if (!ah1.settled) ah1.rotationSpeed += (Math.random() - 0.5) * 0.2;
              if (!ah2.settled) ah2.rotationSpeed -= (Math.random() - 0.5) * 0.2;

              // If a dynamic object collides with a settled one, and it has very low velocity,
              // it might settle next to it.
              if (ah1.settled && Math.abs(ah2.vx) < MIN_VELOCITY_TO_SETTLE && Math.abs(ah2.vy) < MIN_VELOCITY_TO_SETTLE) {
                // ah2.settled = true; // This can lead to chain settling, maybe too complex for now
              }
              if (ah2.settled && Math.abs(ah1.vx) < MIN_VELOCITY_TO_SETTLE && Math.abs(ah1.vy) < MIN_VELOCITY_TO_SETTLE) {
                // ah1.settled = true;
              }
            }
          }
        }
        
        // Re-check settling condition after collisions, especially near the floor
        return updatedAhs.map(ah => {
          if (ah.settled) return ah;
          let isSettled = ah.settled;
          if ( Math.abs(ah.vy) < MIN_VELOCITY_TO_SETTLE && 
               ah.y >= gameDimensions.height - ah.size - SETTLE_THRESHOLD_Y &&
               Math.abs(ah.vx) < MIN_VELOCITY_TO_SETTLE / 2 && 
               Math.abs(ah.rotationSpeed) < 0.1) {
            ah.vy = 0;
            ah.vx = 0;
            ah.rotationSpeed = 0;
            isSettled = true;
          }
          return {...ah, settled: isSettled};
        });

      });
      animationFrameId = requestAnimationFrame(updatePhysics);
    };

    animationFrameId = requestAnimationFrame(updatePhysics);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameDimensions]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-sky-400 via-indigo-500 to-purple-600 p-4 text-white select-none overflow-hidden">
      <header className="mb-6 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.3)' }}>「ああああああ」</h1>
        <p className="text-lg opacity-90 mt-1">ボタンを押して「あ」を降らせよう！</p>
      </header>
      
      <button
        onClick={addAhCharacter}
        className="bg-pink-500 hover:bg-pink-600 text-white font-bold text-3xl py-4 px-8 rounded-xl shadow-xl transition-all duration-150 ease-in-out transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-pink-300 focus:ring-opacity-50 mb-6"
        // disabled removed to allow unlimited adding
        style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif"}}
      >
        あ
      </button>

      <div 
        ref={gameAreaRef} 
        className="w-full max-w-4xl h-[60vh] bg-white/20 backdrop-blur-sm rounded-2xl shadow-2xl relative overflow-hidden border-2 border-white/30"
        aria-label="ゲームエリア"
      >
        {isClient && ahs.map(ah => (
          <div
            key={ah.id}
            className={`absolute flex items-center justify-center font-black ${ah.color} transition-opacity duration-500 ${ah.settled ? 'opacity-70' : 'opacity-100'}`}
            style={{
              left: `${ah.x}px`,
              top: `${ah.y}px`,
              width: `${ah.size}px`,
              height: `${ah.size}px`,
              fontSize: `${ah.size * 0.9}px`,
              lineHeight: `${ah.size}px`,
              transform: `rotate(${ah.rotation}deg)`,
              willChange: 'transform, top, left, opacity',
              fontFamily: "'M PLUS Rounded 1c', sans-serif, 'Noto Sans JP', sans-serif",
            }}
          >
            {ah.char}
          </div>
        ))}
      </div>
      <footer className="mt-6 text-center text-sm opacity-80">
        <p>あああああああああああああああああああああああああああ</p>
        <p>&copy;ノベルってお & Google AI Studio作「あ」ドロップゲーム</p>
      </footer>
    </div>
  );
};

export default App;
