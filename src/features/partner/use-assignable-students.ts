import { useQuery } from "@tanstack/react-query";
import { myStudentApi, studentApi } from "@/features/partner/api";
import { useAuthStore } from "@/stores/auth-store";

/** Students the caller may hand-pick when assigning: the whole centre for the owner, the teacher's own classes for a teacher. */
export function useAssignableStudents(enabled: boolean) {
  // GET /students is partner_owner-only and answers a teacher with 403.
  const isTeacher = useAuthStore((s) => s.role) === "teacher";
  return useQuery({
    queryKey: [isTeacher ? "my-students" : "students"],
    queryFn: isTeacher ? myStudentApi.list : studentApi.list,
    enabled,
  });
}
