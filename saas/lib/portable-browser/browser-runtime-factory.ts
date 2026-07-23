import { PortableBrowserRuntimeCoordinator, type PortableBrowserRuntimePorts } from './browser-runtime-coordinator.ts'
export const createPortableBrowserRuntime=(ports:PortableBrowserRuntimePorts)=>new PortableBrowserRuntimeCoordinator(ports)
