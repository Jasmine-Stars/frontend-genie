-- Create user roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'organizer', 'user');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create organizer status enum
CREATE TYPE public.organizer_status AS ENUM ('pending', 'approved', 'rejected');

-- Create organizers table (project initiators)
CREATE TABLE public.organizers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  organization_name TEXT NOT NULL,
  organization_type TEXT NOT NULL,
  registration_number TEXT,
  website_url TEXT,
  description TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  verification_documents JSONB,
  status organizer_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizers ENABLE ROW LEVEL SECURITY;

-- Create project status enum
CREATE TYPE public.project_status AS ENUM ('draft', 'active', 'completed', 'cancelled');

-- Create projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID REFERENCES public.organizers(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  target_amount DECIMAL(20, 8) NOT NULL,
  current_amount DECIMAL(20, 8) NOT NULL DEFAULT 0,
  beneficiary_count INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  status project_status NOT NULL DEFAULT 'draft',
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Create donations table
CREATE TABLE public.donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  donor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  amount DECIMAL(20, 8) NOT NULL,
  payment_method TEXT NOT NULL,
  transaction_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

-- Create applications table (for beneficiaries)
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  applicant_name TEXT NOT NULL,
  applicant_age INTEGER NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  address TEXT NOT NULL,
  urgency_level TEXT NOT NULL,
  situation TEXT NOT NULL,
  requested_amount DECIMAL(20, 8) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organizers_updated_at BEFORE UPDATE ON public.organizers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Anyone can view user roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for organizers
CREATE POLICY "Anyone can view approved organizers"
ON public.organizers FOR SELECT
TO authenticated
USING (status = 'approved' OR user_id = auth.uid());

CREATE POLICY "Users can create organizer applications"
ON public.organizers FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pending applications"
ON public.organizers FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins can update all organizers"
ON public.organizers FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for projects
CREATE POLICY "Anyone can view active projects"
ON public.projects FOR SELECT
TO authenticated
USING (
  status = 'active' OR 
  organizer_id IN (
    SELECT id FROM public.organizers WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Approved organizers can create projects"
ON public.projects FOR INSERT
TO authenticated
WITH CHECK (
  organizer_id IN (
    SELECT id FROM public.organizers 
    WHERE user_id = auth.uid() AND status = 'approved'
  )
);

CREATE POLICY "Organizers can update own projects"
ON public.projects FOR UPDATE
TO authenticated
USING (
  organizer_id IN (
    SELECT id FROM public.organizers WHERE user_id = auth.uid()
  )
);

-- RLS Policies for donations
CREATE POLICY "Users can view own donations"
ON public.donations FOR SELECT
TO authenticated
USING (donor_id = auth.uid());

CREATE POLICY "Users can create donations"
ON public.donations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = donor_id);

CREATE POLICY "Organizers can view project donations"
ON public.donations FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT p.id FROM public.projects p
    JOIN public.organizers o ON p.organizer_id = o.id
    WHERE o.user_id = auth.uid()
  )
);

-- RLS Policies for applications
CREATE POLICY "Anyone can create applications"
ON public.applications FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can view own applications"
ON public.applications FOR SELECT
TO authenticated
USING (contact_email = (SELECT email FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Organizers can view applications for their projects"
ON public.applications FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT p.id FROM public.projects p
    JOIN public.organizers o ON p.organizer_id = o.id
    WHERE o.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view all applications"
ON public.applications FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));