import { PartnerContent } from "@/components/PartnerContent";

type PartnerPageProps = {
  searchParams?: Promise<{
    error?: string;
    sent?: string;
  }>;
};

export default async function PartnerPage({ searchParams }: PartnerPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <PartnerContent
      error={resolvedSearchParams?.error}
      sent={resolvedSearchParams?.sent}
    />
  );
}
