export default function OperatorApproval({ loading, onApprove }: { loading?: boolean; onApprove: () => void }) {
  return <button className="sb-button-ghost" onClick={onApprove} disabled={loading}>Approve update</button>
}
