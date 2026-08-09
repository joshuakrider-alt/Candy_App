import pygame
import sys

# 1. Initialize the game engine
pygame.init()

# 2. Set up the display window
width = 800
height = 600
screen = pygame.display.set_mode((width, height))
pygame.display.set_caption("My First Python Game")

# 3. Game Variables
# The starting position of our "player"
player_x = 400
player_y = 300
player_speed = 5
player_size = 50

# A clock to control how fast the game runs
clock = pygame.time.Clock()

# 4. The Game Loop
running = True
while running:
    
    # --- A. EVENT HANDLING (Did the user click the 'X' button?) ---
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    # --- B. GAME LOGIC & INPUT (Update the world) ---
    keys = pygame.key.get_pressed()
    
    # Move the player based on arrow keys
    if keys[pygame.K_LEFT]:
        player_x -= player_speed
    if keys[pygame.K_RIGHT]:
        player_x += player_speed
    if keys[pygame.K_UP]:
        player_y -= player_speed
    if keys[pygame.K_DOWN]:
        player_y += player_speed

    # --- C. DRAWING (Render the graphics) ---
    # Fill the screen with black (RGB value: 0, 0, 0)
    screen.fill((0, 0, 0))
    
    # Draw the player as a red rectangle (RGB value: 255, 0, 0)
    pygame.draw.rect(screen, (255, 0, 0), (player_x, player_y, player_size, player_size))

    # Tell the computer to push the new drawing to the screen
    pygame.display.flip()
    
    # Limit the game to 60 Frames Per Second (FPS)
    clock.tick(60)

# Quit the game when the loop ends
pygame.quit()
sys.exit()