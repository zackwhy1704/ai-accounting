import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Building2, User, Shield, Bell, Globe, Key } from 'lucide-react'

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and organization settings</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Company Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Company Information</CardTitle>
              <CardDescription>Your business details for invoices and reports</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="text-sm font-medium">Company Name</label><Input defaultValue="AI Account Demo Pte Ltd" className="mt-1" /></div>
                <div><label className="text-sm font-medium">UEN</label><Input defaultValue="202612345A" className="mt-1" /></div>
                <div><label className="text-sm font-medium">Industry</label><Input defaultValue="Technology" className="mt-1" /></div>
                <div><label className="text-sm font-medium">Currency</label><Input defaultValue="SGD" className="mt-1" /></div>
                <div><label className="text-sm font-medium">GST Rate (%)</label><Input defaultValue="9" type="number" className="mt-1" /></div>
                <div><label className="text-sm font-medium">GST Registration No.</label><Input defaultValue="M90000001A" className="mt-1" /></div>
              </div>
              <div><label className="text-sm font-medium">Address</label><Input defaultValue="1 Raffles Place, #20-01, Singapore 048616" className="mt-1" /></div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>

          {/* Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="text-sm font-medium">Full Name</label><Input defaultValue="Demo User" className="mt-1" /></div>
                <div><label className="text-sm font-medium">Email</label><Input defaultValue="demo@aiaccount.com" className="mt-1" /></div>
              </div>
              <Button>Update Profile</Button>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div><p className="font-medium text-sm">Two-Factor Authentication</p><p className="text-xs text-muted-foreground">Add an extra layer of security</p></div>
                <Button variant="outline" size="sm">Enable</Button>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div><p className="font-medium text-sm">Change Password</p><p className="text-xs text-muted-foreground">Last changed 30 days ago</p></div>
                <Button variant="outline" size="sm">Change</Button>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div><p className="font-medium text-sm">API Keys</p><p className="text-xs text-muted-foreground">Manage API access</p></div>
                <Button variant="outline" size="sm"><Key className="h-3 w-3" /> Manage</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Current Plan</CardTitle></CardHeader>
            <CardContent>
              <div className="text-center">
                <Badge className="mb-2">Essentials</Badge>
                <p className="text-2xl font-bold">$29<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                <p className="text-xs text-muted-foreground mt-1">100 AI doc scans/mo</p>
                <Button className="w-full mt-4" variant="outline">Upgrade Plan</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Integrations</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {['Bank Feed (DBS)', 'Stripe Payments', 'Azure Document AI'].map((name) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-sm">{name}</span>
                  <Badge variant="success" className="text-xs">Connected</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4" /> Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {['Invoice paid', 'Document processed', 'Overdue reminders', 'Weekly summary'].map((name) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-sm">{name}</span>
                  <input type="checkbox" defaultChecked className="rounded" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
