# JarvisSimulationGravity3D

> **An interactive 3D gravity and orbital mechanics simulator built with JavaScript and Three.js.**

**JarvisSimulationGravity3D** is an interactive web-based simulation designed to visualize how gravity affects objects and their surrounding space. The project combines a deformable spatial grid, Newtonian orbital mechanics, object interactions, real-time analysis, and an optional AI command interface.

The goal is not only to show objects moving through space, but also to make the **relationship between mass, gravity, distance, velocity, energy, and orbital motion** visually understandable.

---

## ✨ Features

### 🌌 Gravity & Space Visualization

* **3D Gravity Grid**

  * Visualizes gravitational deformation around massive objects.
  * Grid deformation updates dynamically as objects move.
  * Multiple objects can affect the same spatial area.

* **2D Surface Mode**

  * A simplified grid representation for easier visualization of gravity wells.

* **3D Volume Mode**

  * Extends the visualization into a 3D spatial lattice.
  * Useful for observing gravitational influence from different directions.

* **Extreme Mass Handling**

  * Supports very large and very small mass values.
  * Uses scaled calculations and visualization techniques to prevent extreme values from breaking the scene.

* **Real-Time Updates**

  * Gravity deformation reacts immediately when objects are:

    * Added
    * Moved
    * Deleted
    * Merged
    * Put into orbit

---

# 🪐 Orbital Mechanics

The simulation uses Newtonian gravitational mechanics to calculate orbital behavior.

### Orbital Velocity

For a simplified two-body circular orbit, the required orbital velocity is calculated using:

```text
v = √(GM / r)
```

Where:

* `G` = gravitational constant
* `M` = mass of the central object
* `r` = orbital radius
* `v` = orbital velocity

### Orbit Classification

The simulation analyzes orbital motion using orbital eccentricity:

| Eccentricity | Orbit Type |
| -----------: | ---------- |
|      `e = 0` | Circular   |
|  `0 < e < 1` | Elliptical |
|      `e = 1` | Parabolic  |
|      `e > 1` | Hyperbolic |

The simulator can also identify special states such as:

* **Collision** — objects physically intersect.
* **Escape** — an object becomes gravitationally unbound from the selected central body.

### Orbit Analysis

For an orbiting object, the simulation can display:

* Orbit type
* Eccentricity
* Velocity
* Distance from central body
* Kinetic energy
* Potential energy
* Total mechanical energy
* Orbital status

---

# ⚡ Energy Analysis

The simulator tracks mechanical energy to help visualize orbital stability.

### Kinetic Energy

```text
K = ½mv²
```

### Gravitational Potential Energy

```text
U = -GMm / r
```

### Total Mechanical Energy

```text
E = K + U
```

An **Energy vs. Time** graph is available for selected objects to help identify changes in orbital behavior and numerical instability.

> The simulation is numerical and visualization-oriented, so small energy errors can occur due to timestep integration and floating-point precision.

---

# 💥 Collision & Object Interaction

Objects can interact with each other based on their physical distance.

### Collision Detection

A collision occurs when:

```text
distance < radius₁ + radius₂
```

When a collision occurs, the simulator can merge the objects into a larger body.

The resulting object inherits the combined mass:

```text
M_total = M₁ + M₂
```

This allows the simulation to demonstrate simple mass accumulation and gravitational growth.

---

# 🛰️ Object Types

The simulator supports different astronomical object types, allowing users to experiment with different gravitational systems.

Examples include:

* ⭐ Star
* 🪐 Planet
* 🌙 Moon
* ☄️ Asteroid
* 🕳️ Black Hole
* 💫 Neutron Star
* Pulsar-related objects
* Custom objects

Each object can have properties such as:

* Name
* Mass
* Radius
* Position
* Velocity
* Color
* Orbital state

---

# 🎨 Visualization

### Starfield

A dynamic 3D starfield provides a space environment around the simulation.

### Gravity Field Vectors

Optional vector arrows visualize the direction of gravitational influence.

### Orbit Trails

Orbiting objects can leave a visual trajectory behind them.

This makes it easier to understand:

* Circular orbits
* Elliptical orbits
* Changing orbital paths
* Escape trajectories
* Orbital instability

### Dynamic Camera

The 3D camera allows the user to inspect the simulation from different angles and distances.

---

# 📊 Object Analysis

Selecting an object opens an analysis panel containing information about its current state.

Depending on the object, the panel can display:

```text
Object Name
Object Type
Mass
Radius
Position
Velocity
Distance
Orbit Type
Eccentricity
Energy
Orbital Status
```

The analysis panel is designed to provide both a quick overview for beginners and useful numerical information for experimentation.

---

# 🤖 AI Command Interface

JarvisSimulationGravity3D includes an optional natural-language command interface powered by **Ollama**.

Instead of manually navigating through the interface, users can enter commands such as:

```text
Create a black hole
```

```text
Create Earth
```

```text
Delete Earth
```

```text
Create a planet around the Sun
```

The AI layer interprets the command and converts it into simulation actions.

### Ollama Integration

The project can connect to a locally running Ollama instance using:

```text
qwen2.5:1.5b
```

The AI runs locally rather than requiring a cloud-based AI API.

### Smart Fallback

If the AI model is unavailable, the application can fall back to a built-in keyword-based command parser.

This means basic commands can still work without the AI model.

---

# 🧩 Preset Systems

The project includes predefined examples for quickly testing different scenarios.

### ☀️ Solar System

Example configuration:

```text
Sun
├── Mercury
├── Venus
├── Earth
│   └── Moon
└── Mars
    ├── Phobos
    └── Deimos
```

### 🕳️ Exotic Systems

Additional scenarios can demonstrate unusual gravitational systems, including:

* Black Hole
* Neutron Star
* Pulsar-related systems
* Blanet-like systems
* High-mass gravitational systems

These presets allow users to experiment without manually creating every object.

---

# ⏱️ Simulation Controls

The simulation includes real-time controls:

* ▶️ Play
* ⏸️ Pause
* Simulation speed adjustment
* Object selection
* Object movement
* Camera control
* Gravity vector toggle
* Orbit trail toggle

Simulation speed can be adjusted from:

```text
0.001× → 6×
```

This allows users to observe both very slow orbital changes and faster system evolution.

---

# 🖱️ Controls

| Input                       | Action                     |
| --------------------------- | -------------------------- |
| Left Click + Drag           | Rotate camera              |
| Right Click + Drag          | Pan camera                 |
| Scroll Wheel                | Zoom                       |
| Left Click                  | Select object              |
| Left Click + Drag on Object | Move object                |
| Bottom Navigation           | Change application section |

Dragging an orbiting object can intentionally modify its trajectory.

---

# 🧭 Application Sections

The interface is divided into several main sections:

### Explore

Main simulation environment.

Used for:

* Viewing the system
* Selecting objects
* Observing gravity
* Controlling the camera

### AI

Natural-language command interface.

### Add Object

Create and configure new astronomical objects.

### Examples

Load predefined astronomical systems.

### Settings

Configure visualization and simulation options.

---

# 🛠️ Technologies

The project is built primarily with web technologies.

| Technology | Purpose                      |
| ---------- | ---------------------------- |
| HTML5      | Application structure        |
| CSS3       | Interface and visual styling |
| JavaScript | Simulation logic             |
| Three.js   | 3D rendering                 |
| Chart.js   | Energy visualization         |
| Ollama     | Local AI command processing  |

---

# 📦 Dependencies

### Three.js

Used for:

* 3D rendering
* Cameras
* Lighting
* Meshes
* Scene management
* Spatial visualization

Version:

```text
0.160.0
```

### Chart.js

Used for:

* Energy vs. Time graphs
* Object analysis visualization

Version:

```text
4.4.0
```

### Ollama

Optional dependency used for the AI command interface.

Recommended model:

```text
qwen2.5:1.5b
```

The simulation itself does **not** require Ollama.

---

# 🚀 How to Run

## 1. Clone the Repository

```bash
git clone https://github.com/your-username/JarvisSimulationGravity3D.git
cd JarvisSimulationGravity3D
```

## 2. Start a Local Web Server

Because the project uses JavaScript ES modules, running the project through a local server is recommended.

### Python

```bash
python -m http.server 5500
```

Then open:

```text
http://localhost:5500
```

### VS Code

Alternatively, use an extension such as **Live Server**.

Open:

```text
index.html
```

and launch it through the local development server.

---

# 🤖 Optional AI Setup

To enable the AI command interface:

### 1. Install Ollama

Install Ollama on your computer.

### 2. Download the Model

```bash
ollama pull qwen2.5:1.5b
```

### 3. Start Ollama

```bash
ollama serve
```

The application can then communicate with the local Ollama API.

> AI functionality is optional. The core gravity and orbital simulation can run without Ollama.

---

# 📁 Project Structure

```text
JarvisSimulationGravity3D/
│
├── index.html
│   └── Main application structure
│
├── style.css
│   └── User interface and visual styling
│
├── script.js
│   └── Simulation engine, Three.js setup,
│       physics calculations, object management,
│       orbital mechanics, UI logic, and AI commands
│
└── README.md
    └── Project documentation
```

---

# 🧠 Simulation Concept

The project combines several systems into one interactive environment:

```text
                ┌─────────────────────┐
                │     User Input      │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │   Simulation State  │
                └──────────┬──────────┘
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
        Gravity        Collision      Orbital
        System         System         Mechanics
             │             │             │
             └─────────────┼─────────────┘
                           ▼
                ┌─────────────────────┐
                │   Physics Update    │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  3D Visualization   │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │   Analysis / Graph  │
                └─────────────────────┘
```

The main idea is to connect **physics calculations with visual feedback**, allowing users to see how changing mass, distance, and velocity affects a gravitational system.

---

# ⚠️ Simulation Scope & Limitations

JarvisSimulationGravity3D is primarily an **educational and visualization project**.

It should not be interpreted as a full astrophysical simulation.

Some limitations include:

* Numerical integration introduces small errors.
* Extremely large mass values require visual scaling.
* The visual deformation of the grid is not a complete General Relativity solution.
* Multi-body systems can behave differently from idealized two-body orbital calculations.
* Collision and merger behavior is simplified.
* Object radius and visual scale may be adapted for visualization rather than astronomical scale.
* The AI command system depends on the locally configured Ollama model.

The purpose of these simplifications is to make complex gravitational concepts interactive and understandable while keeping the application usable in real time.

---

# 🎯 Project Goals

The project aims to explore the relationship between:

```text
Mass
  ↓
Gravity
  ↓
Acceleration
  ↓
Velocity
  ↓
Orbital Motion
  ↓
Energy
  ↓
System Evolution
```

Rather than simply displaying planets orbiting a star, the simulator allows users to **experiment with the underlying variables** and observe how the system responds.

---

# 🔮 Future Development

There is no fixed limit to how this project can evolve.

You can develop **anything you like** on top of the existing simulation.

Possible directions include:

* More accurate N-body gravitational integration
* Improved adaptive timestep handling
* Better multi-body orbital prediction
* Lagrange point visualization
* More advanced collision physics
* Momentum conservation during mergers
* Adjustable simulation parameters
* Additional astronomical object types
* Improved orbital prediction
* 3D gravity-field visualization
* More detailed energy and momentum analysis
* Better AI command interpretation
* Save/load simulation states
* Export simulation data
* Performance optimization for large numbers of objects
* Completely new simulation mechanics
* New visualization systems
* New interaction methods
* New astronomical scenarios

These are only suggestions, not restrictions.

**Build whatever you want. Experiment with the physics, redesign the interface, add new objects, create new systems, or take the simulation in a completely different direction.**

The project is intended to be an open-ended foundation for experimentation and development.
