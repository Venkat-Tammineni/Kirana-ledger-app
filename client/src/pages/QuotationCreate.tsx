import { useLocation } from "wouter";
import QuotationForm from "@/components/QuotationForm";
import { useCreateQuotation } from "@/hooks/use-pos";
import { useToast } from "@/hooks/use-toast";
import type { CreateQuotationInput } from "@shared/routes";

export default function QuotationCreate() {
  const [, setLocation] = useLocation();
  const { mutate: createQuotation, isPending } = useCreateQuotation();
  const { toast } = useToast();

  const handleSubmit = (data: CreateQuotationInput) => {
    createQuotation(data, {
      onSuccess: (quotation) => {
        toast({ title: "Quotation saved", description: "Quotation created successfully." });
        setLocation(`/quotations/${quotation.id}`);
      },
      onError: (error: Error) => {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
      },
    });
  };

  return <QuotationForm mode="create" saving={isPending} onSubmit={handleSubmit} />;
}
