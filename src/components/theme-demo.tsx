/**
 * Theme Demo Component
 * 
 * This component demonstrates the various theming features available
 * in the AR Studio application. Use this as a reference for implementing
 * consistent theming across your components.
 */

"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme-toggle"
import { Palette, Sparkles, CheckCircle, AlertTriangle, Info, Zap } from "lucide-react"

export function ThemeDemo() {
  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Theme Showcase</h1>
          <p className="text-muted-foreground">
            Explore the custom theming capabilities of AR Studio
          </p>
        </div>
        <ThemeToggle />
      </div>

      {/* Color Palette */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Color Palette
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Primary Colors */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Primary Colors</h3>
            <div className="flex gap-2">
              <div className="w-12 h-12 rounded-md bg-background border flex items-center justify-center">
                <span className="text-xs">BG</span>
              </div>
              <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center">
                <span className="text-xs text-primary-foreground">PRI</span>
              </div>
              <div className="w-12 h-12 rounded-md bg-secondary flex items-center justify-center">
                <span className="text-xs text-secondary-foreground">SEC</span>
              </div>
              <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center">
                <span className="text-xs text-muted-foreground">MUT</span>
              </div>
              <div className="w-12 h-12 rounded-md bg-accent flex items-center justify-center">
                <span className="text-xs text-accent-foreground">ACC</span>
              </div>
            </div>
          </div>

          {/* Custom Brand Colors */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Brand Colors</h3>
            <div className="flex gap-2">
              <div className="w-12 h-12 rounded-md bg-brand flex items-center justify-center">
                <span className="text-xs text-brand-foreground">BR</span>
              </div>
              <div className="w-12 h-12 rounded-md bg-success flex items-center justify-center">
                <span className="text-xs text-success-foreground">OK</span>
              </div>
              <div className="w-12 h-12 rounded-md bg-warning flex items-center justify-center">
                <span className="text-xs text-warning-foreground">⚠</span>
              </div>
              <div className="w-12 h-12 rounded-md bg-info flex items-center justify-center">
                <span className="text-xs text-info-foreground">ℹ</span>
              </div>
              <div className="w-12 h-12 rounded-md bg-destructive flex items-center justify-center">
                <span className="text-xs text-white">×</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Button Variants */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Button Variants
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Default Buttons */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Standard Variants</h3>
              <div className="flex gap-2 flex-wrap">
                <Button variant="default">Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
                <Button variant="destructive">Destructive</Button>
              </div>
            </div>

            {/* Custom Brand Buttons */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Brand Variants</h3>
              <div className="flex gap-2 flex-wrap">
                <Button variant="brand">
                  <Sparkles className="h-4 w-4" />
                  Brand
                </Button>
                <Button variant="success">
                  <CheckCircle className="h-4 w-4" />
                  Success
                </Button>
                <Button variant="warning">
                  <AlertTriangle className="h-4 w-4" />
                  Warning
                </Button>
                <Button variant="info">
                  <Info className="h-4 w-4" />
                  Info
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Badge Variants */}
      <Card>
        <CardHeader>
          <CardTitle>Badge Variants</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Default Badges */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Standard Variants</h3>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="default">Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
              </div>
            </div>

            {/* Custom Brand Badges */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Brand Variants</h3>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="brand">Brand</Badge>
                <Badge variant="success">✓ Success</Badge>
                <Badge variant="warning">⚠ Warning</Badge>
                <Badge variant="info">ℹ Info</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Examples */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Examples</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Status Indicators</h3>
            <div className="flex gap-2 items-center">
              <Badge variant="success">Paid in Full</Badge>
              <Badge variant="warning">Pending Payment</Badge>
              <Badge variant="info">In Progress</Badge>
              <Badge variant="destructive">Overdue</Badge>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Action Buttons</h3>
            <div className="flex gap-2">
              <Button variant="brand">Create Order</Button>
              <Button variant="success">Save Changes</Button>
              <Button variant="outline">Cancel</Button>
              <Button variant="destructive">Delete</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Implementation Note */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="text-center space-y-2">
            <h3 className="font-medium">Implementation Note</h3>
            <p className="text-sm text-muted-foreground">
              You can now use these custom variants throughout your application.
              Example: <code className="px-1 py-0.5 rounded bg-muted text-sm">&lt;Button variant="success"&gt;</code>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}