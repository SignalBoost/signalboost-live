type Props = {
  title: string;
  value: string;
  description: string;
};

export default function DashboardCard({
  title,
  value,
  description
}: Props) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
      <p className="text-sm text-neutral-400">{title}</p>
      <h2 className="mt-3 text-3xl font-bold text-white">{value}</h2>
      <p className="mt-2 text-sm text-neutral-500">{description}</p>
    </div>
  );
}
