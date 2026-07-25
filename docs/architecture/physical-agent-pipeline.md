# Physical-Agent Governed Pipeline

## Purpose

SignalBoost extends the existing governed agent pipeline to physical agents without redesigning provider templates or changing COS execution philosophy.

The physical-agent integration is supervisory. Real-time stabilization, collision avoidance, motor control, actuator timing, and other hard real-time safety responsibilities remain on the robot controller or autopilot.

## Existing pipeline

```text
Drone / Robot / Physical Agent
          |
          v
MAVLink / ROS 2
          |
          v
Agent Gateway
          |
          v
Normalized AgentRequest
          |
          v
Consequence classification and EAE context
          |
          v
COS governance and approval
          |
          +-- Direct API / protocol execution
          +-- COSA PR
          +-- Browser Agent
          +-- Manual
```

The four COS execution paths already exist and are not redefined by this architecture:

1. Direct API
2. COSA PR
3. Browser Agent
4. Manual

## Protocol responsibility

### MAVLink

MAVLink commands enter through `createMavlinkAdapter()` and normalize into the same internal `AgentRequest` used by software-agent protocols. Governed outcomes return through a MAVLink `COMMAND_ACK`-style envelope.

Examples:

- `NAV_LAND`, `NAV_TAKEOFF`, and `NAV_WAYPOINT` are physical-safety commands and halt for human approval.
- `RETURN_TO_LAUNCH` may execute only when the buyer policy explicitly allows the reversible recovery action.
- Read-only telemetry may execute only when explicitly allowlisted.

### ROS 2

ROS 2 actions and topic goals enter through `createRos2Adapter()` and normalize into the same internal request shape. Governed outcomes return as ROS 2-style statuses such as `SUCCEEDED`, `PENDING_APPROVAL`, or `ABORTED`.

Examples:

- `navigate_to_pose`, docking, actuator, and payload actions are treated as physical-safety operations.
- Equivalent normalized commands receive the same governance verdict regardless of whether they arrived through MAVLink or ROS 2.

## Governance invariants

- Unknown protocols fail closed.
- Unknown commands fail closed to approval.
- Safety classification overrides an allowlist entry.
- No command executes before the applicable approval boundary is satisfied.
- Every decision and execution outcome is auditable.
- Customer-owned devices, controllers, credentials, endpoints, and safety systems remain customer-owned.
- SignalBoost does not replace the autopilot, PLC, robot controller, or real-time safety loop.

## Extension model

Future physical or industrial protocols plug into the Agent Gateway as adapters. They must normalize into `AgentRequest`, use the existing classifier and governance core, and denormalize governed outcomes into their native protocol format.

Potential future adapters include OPC UA, MQTT, Modbus TCP, DDS integrations beyond ROS 2, and other enterprise robotics or industrial protocols. Adding an adapter must not require changes to COS or provider-template execution philosophy.

## Current proof

The automated robotics gateway suite registers MCP, A2A, MAVLink, and ROS 2 concurrently and verifies:

- software and physical protocols share one registry;
- MAVLink and ROS 2 normalize into the same governance model;
- physical-safety commands halt for approval;
- reversible recovery and read-only actions remain policy-controlled;
- protocol-specific acknowledgement envelopes preserve the governance result.
