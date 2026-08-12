import type { KnowledgeGap } from '@/lib/cos-core/layers/learning'

export function roboticsPhysicsCurriculum(): KnowledgeGap[] {
  const topics: Array<[string, string, string, number]> = [
    ['kinematics-mechanics', 'Kinematics, mechanics, and compliant systems', 'How do rigid-body kinematics, dynamics, joints, tendons, transmissions, actuators, compliance, torque, force, load paths, fatigue, and contact mechanics determine how robotic systems behave under load?', 89],
    ['real-world-physics', 'Real-world physics and simulation', 'How should an intelligent system reason about gravity, friction, momentum, impulse, collision, contact, deformable objects, uncertainty, and sim-to-real transfer using synthetic data, digital twins, and physics simulation?', 88],
    ['thermodynamics-robotics', 'Thermodynamics and thermal management', 'How do heat generation, conduction, convection, thermal limits, duty cycle, actuator efficiency, battery temperature, force output, and speed interact during sustained robotic or electromechanical operation?', 85],
    ['computer-vision-spatial-perception', 'Computer vision and spatial perception', 'How do modern perception systems transform camera, depth, spatial, and multimodal sensor data into localization, mapping, object detection, tracking, pose estimation, scene understanding, and actionable world models?', 90],
    ['robotic-manipulation', 'Robotic manipulation and tactile control', 'What techniques enable dexterous manipulation, grasp planning, grip-force control, tactile feedback, slip detection, compliant control, multi-degree-of-freedom hands, and handling of fragile or deformable objects?', 91],
    ['hardware-software-control', 'Hardware-software integration and real-time control', 'How should perception, planning, control loops, actuator commands, embedded systems, motor controllers, buses, latency budgets, safety limits, and feedback be integrated for low-latency reliable physical action?', 89],
    ['spatial-geometry', 'Spatial geometry and motion planning', 'How are 3D coordinates, coordinate frames, transforms, rotations, quaternions, object orientation, inverse kinematics, collision geometry, trajectory optimization, and path planning used in autonomous physical systems?', 88],
    ['probability-statistics-robotics', 'Probability, statistics, and decision-making under uncertainty', 'How do Bayesian inference, state estimation, Kalman and particle filtering, uncertainty propagation, probabilistic planning, risk estimation, and sequential decision-making support robust behavior with noisy sensors and unpredictable objects?', 87],
  ]

  return topics.map(([id, subject, question, urgency]) => ({
    id: `curriculum:robotics:${id}`,
    subject,
    question,
    portableIds: ['cos'],
    expectedReuse: 20,
    expectedAvoidedCostUsd: 1,
    urgency,
    evidence: ['recurring COS robotics, physics, engineering, mathematics, and physical-intelligence curriculum'],
  }))
}
