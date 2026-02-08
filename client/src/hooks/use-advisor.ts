import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useAdvisor() {
  return useMutation({
    mutationFn: async (question: string) => {
      const res = await apiRequest("POST", "/api/advisor/ask", { question });
      return res.json();
    },
  });
}
