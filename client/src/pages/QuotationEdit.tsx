import { useLocation, useRoute } from "wouter";
import QuotationForm from "@/components/QuotationForm";
import { useQuotation, useUpdateQuotation } from "@/hooks/use-pos";
import { useToast } from "@/hooks/use-toast";
import type { CreateQuotationInput } from "@shared/routes";

export default function QuotationEdit() {
  const [, params] = useRoute("/quotations/:id/edit");
  const quotationId = Number(params?.id);
  const [, setLocation] = useLocation();
  const { data: quotation, isLoading } = useQuotation(quotationId);
  const { mutate: updateQuotation, isPending } = useUpdateQuotation();
  const { toast } = useToast();

  const handleSubmit = (data: CreateQuotationInput) => {
    updateQuotation(
      { id: quotationId, quotation: data },
      {
        onSuccess: () => {
          toast({ title: "Quotation updated", description: "Changes saved successfully." });
          setLocation(`/quotations/${quotationId}`);
        },
        onError: (error: Error) => {
          toast({ title: "Update failed", description: error.message, variant: "destructive" });
        },
      },
    );
  };

  return <QuotationForm mode="edit" quotation={quotation} loading={isLoading} saving={isPending} onSubmit={handleSubmit} />;
}
