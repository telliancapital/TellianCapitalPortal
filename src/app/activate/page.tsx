import ActivationForm from "@/components/ActivationForm";

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <ActivationForm token={Array.isArray(token) ? token[0] : token} />;
}
