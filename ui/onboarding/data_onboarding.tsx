import { useEffect, useState } from "react";
import { Download, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import DialogPost from "@/components/console/dialog-post";

interface BlueprintField {
  name: string;
  layer?: string;
  options?: Record<string, string>;
  widget?: string;
  required?: boolean;
  [key: string]: any;
}

interface Blueprint {
  label: string;
  fields?: BlueprintField[];
  [key: string]: any;
}

interface TreeStructure {
  portfolios: {
    [key: string]: {
      name: string;
      portfolio_id: string;
      orgs: object;
      teams: object;
      tools: object;
    };
  };
  user_id: string;
}

interface OnboardingProps {
  tree: TreeStructure;
}

import {
    Telescope,
  } from "lucide-react"

export default function DataOnboarding({ tree }: OnboardingProps) {
  const [blueprint, setBlueprint] = useState<Blueprint>({ label: "" });
  const [modifiedBlueprint, setModifiedBlueprint] = useState<Blueprint>({ label: "" });

  useEffect(() => {
    const fetchBlueprint = async () => {
      try {
        const blueprintResponse = await fetch(
          `${import.meta.env.VITE_API_URL}/_blueprint/irma/data_onboardings/last`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${sessionStorage.accessToken}`,
            },
          }
        );
        const blueprintData = await blueprintResponse.json();
        setBlueprint(blueprintData);
        setModifiedBlueprint({ ...blueprintData });
      } catch (err) {
        console.log(err);
      }
    };

    fetchBlueprint();
  }, []);

  useEffect(() => {
    if (!tree?.portfolios || !blueprint?.fields) {
      return;
    }

    const portfolioDict: Record<string, string> = {};
    Object.entries(tree.portfolios).forEach(([portfolioId, portfolio]) => {
      portfolioDict[portfolioId] = portfolio.name;
    });

    const updatedBlueprint = {
      ...blueprint,
      fields: blueprint.fields.map((field: BlueprintField) => {
        if (field.name === "portfolio") {
          return {
            ...field,
            layer: "0",
            options: portfolioDict,
            widget: "select",
            required: true,
          };
        }
        return field;
      }),
    };

    setModifiedBlueprint(updatedBlueprint);
  }, [tree, blueprint]);

  const refreshAction = () => {};
  const portfolioField = modifiedBlueprint.fields?.find(
    (field: BlueprintField) => field.name === "portfolio"
  );
  const hasPortfolioOptions =
    !!portfolioField?.options && Object.keys(portfolioField.options).length > 0;

  return (
    <Card className="group relative overflow-hidden border-border bg-card transition-all hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5">
      <div className="absolute right-3 top-3">
        <Badge className="bg-accent text-accent-foreground">Verified</Badge>
      </div>
      <CardContent className="p-5">
        <div className="mb-4 flex items-start gap-4">
          <Telescope size={68} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold text-foreground">Data App</h3>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              Explore, structure, and activate your portfolio data workflows.
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-1.5">
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            analytics
          </span>
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            portfolio
          </span>
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            onboarding
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="flex items-center gap-4">
            <div className="text-xs text-muted-foreground">by Renglo</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Download className="h-3.5 w-3.5" />
              Included
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
              Core
            </div>
          </div>
          {hasPortfolioOptions ? (
            <DialogPost
              refreshUp={refreshAction}
              blueprint={modifiedBlueprint}
              title="Activate your portfolio"
              instructions="Please fill the following fields:"
              path={`${import.meta.env.VITE_API_URL}/_schd/run/data/data_onboardings`}
              method="POST"
              buttontext="Install"
            />
          ) : (
            <div className="text-xs font-medium text-red-500">Create a portfolio first</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
  