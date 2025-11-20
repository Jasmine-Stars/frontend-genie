import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Users, Target, TrendingUp } from "lucide-react";

interface ProjectCardProps {
  id: string;
  title: string;
  description: string;
  category: string;
  organizerName: string;
  targetAmount: number;
  currentAmount: number;
  beneficiaryCount: number;
  imageUrl?: string;
}

const ProjectCard = ({
  id,
  title,
  description,
  category,
  organizerName,
  targetAmount,
  currentAmount,
  beneficiaryCount,
  imageUrl,
}: ProjectCardProps) => {
  const progress = (currentAmount / targetAmount) * 100;

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 group">
      {imageUrl && (
        <div className="relative h-48 overflow-hidden">
          <img 
            src={imageUrl} 
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <Badge className="absolute top-3 right-3">{category}</Badge>
        </div>
      )}
      <CardHeader>
        <CardTitle className="line-clamp-2 group-hover:text-primary transition-colors">
          {title}
        </CardTitle>
        <CardDescription className="line-clamp-2">{description}</CardDescription>
        <div className="text-sm text-muted-foreground mt-2">
          发起者：{organizerName}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">筹款进度</span>
            <span className="font-semibold">{currentAmount.toFixed(2)} / {targetAmount.toFixed(2)} ETH</span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="text-xs text-muted-foreground text-right">
            {progress.toFixed(1)}% 完成
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 p-2 bg-accent/50 rounded-lg">
            <Users className="w-4 h-4 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">受助人数</div>
              <div className="font-semibold">{beneficiaryCount}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 bg-accent/50 rounded-lg">
            <TrendingUp className="w-4 h-4 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">剩余目标</div>
              <div className="font-semibold">{(targetAmount - currentAmount).toFixed(2)}</div>
            </div>
          </div>
        </div>

        <Link to={`/donate?project=${id}`} className="block">
          <Button className="w-full bg-gradient-primary hover:opacity-90">
            立即捐助
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
};

export default ProjectCard;
