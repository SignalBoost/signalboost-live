import { asksWhereTheAnswerCameFrom, isProvenanceIntrospectionIntent } from './provenanceIntrospectionIntent'
export { asksWhereTheAnswerCameFrom }
/** True only for a request to reveal the recorded origin of a prior answer. */
export function isProvenanceIntrospection(input: string): boolean { return isProvenanceIntrospectionIntent(input) }
