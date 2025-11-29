-- 允许管理员修改 "applications" (受助人申请) 表
DROP POLICY IF EXISTS "Admins can update applications" ON public.applications;
CREATE POLICY "Admins can update applications"
ON public.applications
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
);

-- 允许管理员修改 "merchants" (商户) 表
DROP POLICY IF EXISTS "Admins can update merchants" ON public.merchants;
CREATE POLICY "Admins can update merchants"
ON public.merchants
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
);

-- 允许管理员修改 "organizers" (NGO) 表
DROP POLICY IF EXISTS "Admins can update organizers" ON public.organizers;
CREATE POLICY "Admins can update organizers"
ON public.organizers
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
);

-- 允许管理员修改 "user_roles" 表 (用于赋予通过审核的用户新角色)
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
);
