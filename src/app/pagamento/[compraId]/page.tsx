import PagamentoPix from "@/components/PagamentoPix";

export default async function PaginaPagamento({
  params,
}: {
  params: Promise<{ compraId: string }>;
}) {
  const { compraId } = await params;
  return <PagamentoPix compraId={compraId} />;
}
