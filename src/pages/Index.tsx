import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import Impact from "@/components/Impact";
import Footer from "@/components/Footer";
import ProjectCard from "@/components/ProjectCard";
import { Loader2 } from "lucide-react";

interface Project {
  id: string;
  title: string;
  description: string;
  category: string;
  target_amount: number;
  current_amount: number;
  beneficiary_count: number;
  image_url: string | null;
  organizers: {
    organization_name: string;
  };
}

const Index = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        
        if (!session.session) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("projects")
          .select(`
            id,
            title,
            description,
            category,
            target_amount,
            current_amount,
            beneficiary_count,
            image_url,
            organizers (
              organization_name
            )
          `)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(6);

        if (error) {
          console.error("Error fetching projects:", error);
        } else {
          setProjects(data || []);
        }
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-16">
        <Hero />
        <Features />
        
        {/* Projects Section */}
        <section className="py-20 bg-accent/20">
          <div className="container mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                正在进行的项目
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                每个项目由经过审核的发起人创建，所有捐款透明可追溯
              </p>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                暂无进行中的项目，请登录后查看
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    id={project.id}
                    title={project.title}
                    description={project.description}
                    category={project.category}
                    organizerName={project.organizers.organization_name}
                    targetAmount={Number(project.target_amount)}
                    currentAmount={Number(project.current_amount)}
                    beneficiaryCount={project.beneficiary_count}
                    imageUrl={project.image_url || undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <Impact />
      </main>
      <Footer />
    </div>
  );
};

export default Index;