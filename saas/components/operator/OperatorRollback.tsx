export default function OperatorRollback({ loading, onRollback }: { loading?: boolean; onRollback: () => void }) {
  return <button className="sb-button-ghost" onClick={onRollback} disabled={loading}>Restore previous version</button>
}
