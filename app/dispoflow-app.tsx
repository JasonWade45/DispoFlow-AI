'use client';

import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  Calendar,
  CalendarCheck,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Download,
  FileText,
  Filter,
  HelpCircle,
  Home,
  LayoutDashboard,
  ListFilter,
  Mail,
  MapPin,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';

type Section = 'Overview' | 'Properties' | 'Buyers' | 'Follow-ups' | 'Offers' | 'Activity log' | 'Reports' | 'Settings';
type PropertyStatus = 'Available' | 'Marketing' | 'Offer Received' | 'Under Contract' | 'Pending' | 'Sold' | 'On Hold' | 'Cancelled';
type BuyerStatus = 'Active' | 'Inactive' | 'Do Not Contact';
type InterestStatus = 'New' | 'Interested' | 'Undecided' | 'Needs Information' | 'Price Concern' | 'Offer Submitted' | 'Counteroffer' | 'Accepted' | 'Not Interested' | 'No Response' | 'Closed — Won' | 'Closed — Lost';
type OfferStatus = 'Draft' | 'Submitted' | 'Under Review' | 'Countered' | 'Accepted' | 'Rejected' | 'Withdrawn' | 'Expired';
type FollowUpStatus = 'Open' | 'Completed' | 'Cancelled';
type EventKind = 'Incoming SMS' | 'Outgoing SMS' | 'Incoming Email' | 'Outgoing Email' | 'Phone Call' | 'Voicemail' | 'Internal Note' | 'Follow-Up Completed' | 'Offer Created' | 'Offer Updated' | 'Status Changed' | 'Other Interaction';

type Property = {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: PropertyStatus;
  askingPrice: number;
  arv: number;
  repairs: number;
  assignmentPrice?: number;
  expectedClose?: string;
  updatedAt: string;
  notes: string;
};

type Buyer = {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  markets: string[];
  status: BuyerStatus;
  preferredContact: 'Text' | 'Email' | 'Call';
  propertyTypes: string[];
  budgetMin: number;
  budgetMax: number;
  notes: string;
  color: string;
};

type Relationship = {
  id: string;
  buyerId: string;
  propertyId: string;
  interestStatus: InterestStatus;
  interestNotes: string;
  firstContactAt: string;
  lastInteractionAt: string;
  nextFollowUpAt?: string;
  nextAction: string;
};

type FollowUp = {
  id: string;
  buyerId: string;
  propertyId?: string;
  description: string;
  dueAt?: string;
  assignedTo: string;
  priority: 'High' | 'Normal' | 'Low';
  status: FollowUpStatus;
  completedAt?: string;
  fromRelationship?: boolean;
};

type Offer = {
  id: string;
  buyerId: string;
  propertyId: string;
  amount: number;
  status: OfferStatus;
  offerDate: string;
  expirationDate?: string;
  terms: string;
  nextAction: string;
  notes: string;
};

type TimelineEvent = {
  id: string;
  buyerId?: string;
  propertyId?: string;
  kind: EventKind;
  direction?: 'Incoming' | 'Outgoing' | 'Internal';
  occurredAt: string;
  recordedAt: string;
  content: string;
  enhancedNotes?: string;
  outcome?: string;
  createdBy: string;
};

type WorkspaceData = {
  properties: Property[];
  buyers: Buyer[];
  relationships: Relationship[];
  tasks: FollowUp[];
  offers: Offer[];
  events: TimelineEvent[];
};

type DrawerState = { type: 'property'; id: string } | { type: 'buyer'; id: string; propertyId?: string } | null;
type ModalState =
  | { type: 'property' }
  | { type: 'edit-property'; id: string }
  | { type: 'buyer' }
  | { type: 'edit-buyer'; id: string }
  | { type: 'relationship'; propertyId?: string; buyerId?: string }
  | { type: 'task'; buyerId?: string; propertyId?: string; taskId?: string; description?: string }
  | { type: 'offer'; buyerId?: string; propertyId?: string }
  | { type: 'interaction'; buyerId?: string; propertyId?: string }
  | { type: 'message'; buyerId: string; propertyId?: string }
  | { type: 'help' }
  | null;

type IconComponent = typeof LayoutDashboard;

const STORAGE_KEY = 'dispoflow-demo-v1';
const propertyStatuses: PropertyStatus[] = ['Available', 'Marketing', 'Offer Received', 'Under Contract', 'Pending', 'Sold', 'On Hold', 'Cancelled'];
const buyerStatuses: BuyerStatus[] = ['Active', 'Inactive', 'Do Not Contact'];
const interestStatuses: InterestStatus[] = ['New', 'Interested', 'Undecided', 'Needs Information', 'Price Concern', 'Offer Submitted', 'Counteroffer', 'Accepted', 'Not Interested', 'No Response', 'Closed — Won', 'Closed — Lost'];
const offerStatuses: OfferStatus[] = ['Draft', 'Submitted', 'Under Review', 'Countered', 'Accepted', 'Rejected', 'Withdrawn', 'Expired'];

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function offsetDate(days: number, hour = 10, minutes = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minutes, 0, 0);
  return date.toISOString();
}

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function dayDifference(isoDate?: string) {
  if (!isoDate) return null;
  const due = startOfDay(new Date(isoDate)).getTime();
  const today = startOfDay(new Date()).getTime();
  return Math.round((due - today) / 86_400_000);
}

function formatCurrency(value: number, compact = false) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    notation: compact && value >= 100_000 ? 'compact' : 'standard',
  }).format(value);
}

function formatDate(iso?: string, options?: Intl.DateTimeFormatOptions) {
  if (!iso) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-US', options ?? { month: 'short', day: 'numeric' }).format(new Date(iso));
}

function formatDateTime(iso?: string) {
  if (!iso) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

function toLocalDateTimeInput(iso?: string) {
  const date = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function getTaskBucket(task: FollowUp): 'Overdue' | 'Due today' | 'Upcoming' | 'Unscheduled' | 'Completed' | 'Cancelled' {
  if (task.status === 'Completed') return 'Completed';
  if (task.status === 'Cancelled') return 'Cancelled';
  if (!task.dueAt) return 'Unscheduled';
  const difference = dayDifference(task.dueAt);
  if (difference !== null && difference < 0) return 'Overdue';
  if (difference === 0) return 'Due today';
  return 'Upcoming';
}

function createDemoData(): WorkspaceData {
  const properties: Property[] = [
    { id: 'p1', address: '1842 W 44th St', city: 'Cleveland', state: 'OH', zip: '44113', status: 'Marketing', askingPrice: 142000, arv: 228000, repairs: 31000, assignmentPrice: 129500, expectedClose: offsetDate(18), updatedAt: offsetDate(0, 9, 28), notes: 'Vacant, lockbox on rear entry. Seller is flexible on closing date.' },
    { id: 'p2', address: '909 E 93rd St', city: 'Cleveland', state: 'OH', zip: '44108', status: 'Offer Received', askingPrice: 89000, arv: 158000, repairs: 24000, assignmentPrice: 81500, expectedClose: offsetDate(24), updatedAt: offsetDate(0, 8, 50), notes: 'Three-bedroom rental. Updated electrical panel; roof age needs confirmation.' },
    { id: 'p3', address: '2176 Brookside Ave', city: 'Akron', state: 'OH', zip: '44312', status: 'Under Contract', askingPrice: 176000, arv: 264000, repairs: 38500, assignmentPrice: 163000, expectedClose: offsetDate(9), updatedAt: offsetDate(-1, 16, 12), notes: 'Buyer walkthrough requested. Title is open with Summit Title.' },
    { id: 'p4', address: '6334 Pearl Rd', city: 'Parma', state: 'OH', zip: '44130', status: 'Marketing', askingPrice: 199000, arv: 298000, repairs: 42000, assignmentPrice: 184000, expectedClose: offsetDate(28), updatedAt: offsetDate(-1, 14, 42), notes: 'Large corner lot. Buyers asked for updated interior photos.' },
    { id: 'p5', address: '513 S Arlington Ave', city: 'Dayton', state: 'OH', zip: '45403', status: 'Available', askingPrice: 72500, arv: 132000, repairs: 27500, updatedAt: offsetDate(-2, 11, 5), notes: 'Needs cleanout. Access available with 24-hour notice.' },
    { id: 'p6', address: '78 Maplewood Dr', city: 'Euclid', state: 'OH', zip: '44123', status: 'Pending', askingPrice: 116000, arv: 189000, repairs: 22000, assignmentPrice: 107000, expectedClose: offsetDate(5), updatedAt: offsetDate(-2, 9, 18), notes: 'Pending inspection response; keep backup buyers warm.' },
    { id: 'p7', address: '1209 Linden Ave', city: 'Toledo', state: 'OH', zip: '43607', status: 'On Hold', askingPrice: 96000, arv: 171000, repairs: 34000, updatedAt: offsetDate(-4, 13, 16), notes: 'Marketing paused pending seller paperwork.' },
  ];

  const buyers: Buyer[] = [
    { id: 'b1', name: 'Marcus Hill', company: 'Hillstone Investments', phone: '(216) 555-0182', email: 'marcus@hillstoneinv.com', markets: ['Cleveland', 'Akron'], status: 'Active', preferredContact: 'Text', propertyTypes: ['Single-family', 'Duplex'], budgetMin: 80000, budgetMax: 225000, notes: 'Moves quickly on clean rentals. Usually reviews numbers with his partner on Thursdays.', color: 'sage' },
    { id: 'b2', name: 'Dana Cooper', company: 'Cooper Home Group', phone: '(440) 555-0136', email: 'dana@cooperhomegroup.com', markets: ['Cleveland', 'Parma'], status: 'Active', preferredContact: 'Email', propertyTypes: ['Single-family'], budgetMin: 60000, budgetMax: 180000, notes: 'Prefers email with repair scope attached. Interested in light-to-medium rehab.', color: 'peach' },
    { id: 'b3', name: 'Jamal Brooks', company: 'Northstar Property Co.', phone: '(330) 555-0149', email: 'jamal@northstarprop.co', markets: ['Akron', 'Cleveland'], status: 'Active', preferredContact: 'Call', propertyTypes: ['Single-family', 'Multi-family'], budgetMin: 100000, budgetMax: 310000, notes: 'Cash buyer. Wants a walkthrough before submitting on properties over $150k.', color: 'blue' },
    { id: 'b4', name: 'Lauren Chen', company: 'LC Residential', phone: '(216) 555-0197', email: 'lauren@lcresidential.com', markets: ['Cleveland', 'Euclid'], status: 'Active', preferredContact: 'Text', propertyTypes: ['Single-family', 'Townhome'], budgetMin: 75000, budgetMax: 200000, notes: 'Long-term rental buyer; asks for rent comps and taxes up front.', color: 'lavender' },
    { id: 'b5', name: 'Eric Vaughn', company: 'Vaughn Capital', phone: '(937) 555-0111', email: 'eric@vaughncapital.com', markets: ['Dayton', 'Toledo'], status: 'Active', preferredContact: 'Call', propertyTypes: ['Single-family'], budgetMin: 50000, budgetMax: 145000, notes: 'Looking to add 2–3 properties this quarter. Can close in 14 days.', color: 'gold' },
    { id: 'b6', name: 'Angela Morris', company: 'Morris & Main', phone: '(216) 555-0173', email: 'angela@morrismain.com', markets: ['Cleveland', 'Parma', 'Euclid'], status: 'Inactive', preferredContact: 'Email', propertyTypes: ['Duplex', 'Multi-family'], budgetMin: 90000, budgetMax: 260000, notes: 'Taking a break from acquisitions until current renovations are complete.', color: 'rose' },
    { id: 'b7', name: 'Robert Flores', company: 'RJF Holdings', phone: '(330) 555-0164', email: 'robert@rjfholdings.com', markets: ['Akron', 'Canton'], status: 'Active', preferredContact: 'Text', propertyTypes: ['Single-family'], budgetMin: 45000, budgetMax: 125000, notes: 'Prefers short text updates. Do not call before 10 a.m.', color: 'teal' },
  ];

  const relationships: Relationship[] = [
    { id: 'r1', buyerId: 'b1', propertyId: 'p1', interestStatus: 'Price Concern', interestNotes: 'Interested; wants to review the numbers with his partner.', firstContactAt: offsetDate(-4, 10), lastInteractionAt: offsetDate(-1, 15, 15), nextFollowUpAt: offsetDate(0, 11, 30), nextAction: 'Confirm price after partner review' },
    { id: 'r2', buyerId: 'b2', propertyId: 'p1', interestStatus: 'Interested', interestNotes: 'Requested updated interior photos.', firstContactAt: offsetDate(-3, 9), lastInteractionAt: offsetDate(0, 9, 20), nextFollowUpAt: offsetDate(1, 10), nextAction: 'Send updated photos' },
    { id: 'r3', buyerId: 'b3', propertyId: 'p2', interestStatus: 'Offer Submitted', interestNotes: 'Submitted an offer; asked for seller response timeline.', firstContactAt: offsetDate(-6, 13), lastInteractionAt: offsetDate(0, 8, 42), nextFollowUpAt: offsetDate(0, 15), nextAction: 'Share seller response when available' },
    { id: 'r4', buyerId: 'b4', propertyId: 'p3', interestStatus: 'Needs Information', interestNotes: 'Waiting on rent comps and updated tax estimate.', firstContactAt: offsetDate(-5, 11), lastInteractionAt: offsetDate(-2, 16), nextFollowUpAt: offsetDate(3, 12), nextAction: 'Send rent comps and tax estimate' },
    { id: 'r5', buyerId: 'b1', propertyId: 'p4', interestStatus: 'Interested', interestNotes: 'Asked whether the seller will consider a flexible close.', firstContactAt: offsetDate(-2, 10), lastInteractionAt: offsetDate(-1, 10, 30), nextFollowUpAt: offsetDate(2, 11), nextAction: 'Confirm seller closing flexibility' },
    { id: 'r6', buyerId: 'b5', propertyId: 'p5', interestStatus: 'Undecided', interestNotes: 'Wants to see the property after the cleanout.', firstContactAt: offsetDate(-8, 14), lastInteractionAt: offsetDate(-3, 12), nextAction: 'Ask if buyer wants to schedule a walkthrough' },
    { id: 'r7', buyerId: 'b6', propertyId: 'p4', interestStatus: 'No Response', interestNotes: 'No reply to the photo package sent last week.', firstContactAt: offsetDate(-10, 10), lastInteractionAt: offsetDate(-7, 9), nextAction: 'Re-engage when acquisition pause ends' },
    { id: 'r8', buyerId: 'b7', propertyId: 'p2', interestStatus: 'Price Concern', interestNotes: 'Asked if there is flexibility on assignment price.', firstContactAt: offsetDate(-2, 11), lastInteractionAt: offsetDate(-1, 13), nextAction: 'Clarify price range before next touch' },
    { id: 'r9', buyerId: 'b2', propertyId: 'p6', interestStatus: 'New', interestNotes: 'Property sent for review; no response yet.', firstContactAt: offsetDate(-1, 15), lastInteractionAt: offsetDate(-1, 15), nextAction: 'Check whether buyer reviewed the property' },
  ];

  const tasks: FollowUp[] = [
    { id: 'f1', buyerId: 'b1', propertyId: 'p1', description: 'Confirm price after partner review', dueAt: offsetDate(-1, 10, 30), assignedTo: 'Sarah Miller', priority: 'High', status: 'Open' },
    { id: 'f2', buyerId: 'b2', propertyId: 'p1', description: 'Send updated interior photos', dueAt: offsetDate(0, 11, 30), assignedTo: 'Sarah Miller', priority: 'Normal', status: 'Open' },
    { id: 'f3', buyerId: 'b3', propertyId: 'p2', description: 'Share seller response on offer', dueAt: offsetDate(0, 15), assignedTo: 'Sarah Miller', priority: 'High', status: 'Open' },
    { id: 'f4', buyerId: 'b4', propertyId: 'p3', description: 'Send rent comps and tax estimate', dueAt: offsetDate(3, 12), assignedTo: 'Michael Reed', priority: 'Normal', status: 'Open' },
    { id: 'f5', buyerId: 'b1', propertyId: 'p4', description: 'Confirm seller closing flexibility', dueAt: offsetDate(2, 11), assignedTo: 'Sarah Miller', priority: 'Low', status: 'Open' },
    { id: 'f6', buyerId: 'b6', propertyId: 'p4', description: 'Check in on acquisition timeline', dueAt: offsetDate(-2, 14), assignedTo: 'Michael Reed', priority: 'Low', status: 'Open' },
    { id: 'f7', buyerId: 'b5', propertyId: 'p5', description: 'Ask about walkthrough availability', assignedTo: 'Sarah Miller', priority: 'Normal', status: 'Open' },
    { id: 'f8', buyerId: 'b7', propertyId: 'p2', description: 'Confirm price range before next touch', dueAt: offsetDate(1, 10), assignedTo: 'Michael Reed', priority: 'Normal', status: 'Open' },
    { id: 'f9', buyerId: 'b2', propertyId: 'p6', description: 'Ask if buyer reviewed the property', dueAt: offsetDate(0, 16), assignedTo: 'Sarah Miller', priority: 'Low', status: 'Open' },
  ];

  const offers: Offer[] = [
    { id: 'o1', buyerId: 'b3', propertyId: 'p2', amount: 81000, status: 'Submitted', offerDate: offsetDate(0, 8, 40), expirationDate: offsetDate(2), terms: 'Cash · 10-day close · inspection period waived', nextAction: 'Share seller response', notes: 'Buyer can provide proof of funds on request.' },
    { id: 'o2', buyerId: 'b1', propertyId: 'p1', amount: 133000, status: 'Under Review', offerDate: offsetDate(-1, 15), terms: 'Cash · 14-day close', nextAction: 'Confirm revised price after partner review', notes: 'Buyer mentioned a possible adjustment; amount is not confirmed.' },
    { id: 'o3', buyerId: 'b7', propertyId: 'p2', amount: 76000, status: 'Countered', offerDate: offsetDate(-1, 13), terms: 'Cash · 21-day close', nextAction: 'Review counteroffer with buyer', notes: 'Seller countered at $82,500.' },
    { id: 'o4', buyerId: 'b4', propertyId: 'p3', amount: 158000, status: 'Draft', offerDate: offsetDate(-2, 16), terms: 'Cash · closing date flexible', nextAction: 'Confirm buyer intent before submission', notes: 'Draft only — not sent to seller.' },
    { id: 'o5', buyerId: 'b2', propertyId: 'p4', amount: 179000, status: 'Accepted', offerDate: offsetDate(-5, 11), terms: 'Cash · 14-day close', nextAction: 'Track contract milestones', notes: 'Accepted subject to signed assignment.' },
  ];

  const events: TimelineEvent[] = [
    { id: 'e1', buyerId: 'b3', propertyId: 'p2', kind: 'Incoming SMS', direction: 'Incoming', occurredAt: offsetDate(0, 8, 42), recordedAt: offsetDate(0, 8, 44), content: 'I can do 81k cash and close in ten days. Let me know what the seller says.', outcome: 'Offer submitted', createdBy: 'Sarah Miller' },
    { id: 'e2', buyerId: 'b2', propertyId: 'p1', kind: 'Phone Call', direction: 'Incoming', occurredAt: offsetDate(0, 9, 20), recordedAt: offsetDate(0, 9, 32), content: 'Dana asked for updated kitchen and basement photos before making a decision.', enhancedNotes: 'Buyer requested updated kitchen and basement photos before deciding.', outcome: 'Information requested', createdBy: 'Sarah Miller' },
    { id: 'e3', buyerId: 'b1', propertyId: 'p1', kind: 'Outgoing SMS', direction: 'Outgoing', occurredAt: offsetDate(-1, 15, 15), recordedAt: offsetDate(-1, 15, 16), content: 'Thanks, Marcus. Take a look with your partner and I will check back tomorrow.', outcome: 'Follow-up promised', createdBy: 'Sarah Miller' },
    { id: 'e4', buyerId: 'b4', propertyId: 'p3', kind: 'Internal Note', direction: 'Internal', occurredAt: offsetDate(-2, 16), recordedAt: offsetDate(-2, 16, 10), content: 'Lauren needs rent comps and current property tax estimate before she can evaluate.', outcome: 'Needs information', createdBy: 'Michael Reed' },
    { id: 'e5', buyerId: 'b1', propertyId: 'p4', kind: 'Incoming Email', direction: 'Incoming', occurredAt: offsetDate(-1, 10, 30), recordedAt: offsetDate(-1, 10, 31), content: 'Would the seller consider a little more time for closing if title needs it?', outcome: 'Question received', createdBy: 'Sarah Miller' },
    { id: 'e6', buyerId: 'b5', propertyId: 'p5', kind: 'Voicemail', direction: 'Incoming', occurredAt: offsetDate(-3, 12), recordedAt: offsetDate(-3, 12, 4), content: 'Eric asked to reconnect after the cleanout and see the property in person.', outcome: 'Walkthrough requested', createdBy: 'Sarah Miller' },
    { id: 'e7', buyerId: 'b2', propertyId: 'p4', kind: 'Offer Created', direction: 'Internal', occurredAt: offsetDate(-5, 11), recordedAt: offsetDate(-5, 11, 2), content: 'Offer of $179,000 marked accepted, subject to signed assignment.', outcome: 'Accepted', createdBy: 'Michael Reed' },
    { id: 'e8', buyerId: 'b6', propertyId: 'p4', kind: 'Outgoing Email', direction: 'Outgoing', occurredAt: offsetDate(-7, 9), recordedAt: offsetDate(-7, 9, 2), content: 'Sent the updated photo package and asked whether the property fits current buying plans.', outcome: 'No response yet', createdBy: 'Michael Reed' },
  ];

  return { properties, buyers, relationships, tasks, offers, events };
}

function getPropertyAddress(property?: Property) {
  return property ? `${property.address}, ${property.city}, ${property.state}` : 'Property not linked';
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

function firstName(name: string) {
  return name.split(' ')[0] ?? name;
}

function StatusBadge({ children, tone }: { children: ReactNode; tone?: string }) {
  const label = String(children);
  const fallback = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return <span className={`status-badge tone-${tone ?? fallback}`}>{children}</span>;
}

function Avatar({ name, color = 'sage', size = 'normal' }: { name: string; color?: string; size?: 'tiny' | 'small' | 'normal' | 'large' }) {
  return <span className={`avatar avatar-${color} avatar-${size}`} aria-label={name}>{initials(name)}</span>;
}

function CardHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="card-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon = FileText, title, description, action }: { icon?: IconComponent; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={19} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export default function DispoFlowApp() {
  const [data, setData] = useState<WorkspaceData>(() => createDemoData());
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<Section>('Overview');
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [propertySearch, setPropertySearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('All statuses');
  const [buyerSearch, setBuyerSearch] = useState('');
  const [buyerFilter, setBuyerFilter] = useState('All buyers');
  const [taskFilter, setTaskFilter] = useState('All');
  const [activityFilter, setActivityFilter] = useState('All activity');
  const [teamView, setTeamView] = useState<'My work' | 'Everyone'>('Everyone');
  const [reportPeriod, setReportPeriod] = useState('Last 7 days');
  const [settingsTab, setSettingsTab] = useState('Workspace');
  const [notificationPreference, setNotificationPreference] = useState(true);
  const [aiPreference, setAiPreference] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setData(JSON.parse(saved) as WorkspaceData);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, ready]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setNotificationsOpen(false);
        setModal(null);
        setDrawer(null);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const activeTasks = data.tasks.filter((task) => task.status === 'Open');
  const overdueTasks = activeTasks.filter((task) => getTaskBucket(task) === 'Overdue');
  const dueTodayTasks = activeTasks.filter((task) => getTaskBucket(task) === 'Due today');
  const upcomingTasks = activeTasks.filter((task) => getTaskBucket(task) === 'Upcoming');
  const unscheduledTasks = activeTasks.filter((task) => getTaskBucket(task) === 'Unscheduled');
  const openOffers = data.offers.filter((offer) => ['Draft', 'Submitted', 'Under Review', 'Countered'].includes(offer.status));
  const activeProperties = data.properties.filter((property) => !['Sold', 'Cancelled'].includes(property.status));
  const activeBuyers = data.buyers.filter((buyer) => buyer.status === 'Active');
  const completedToday = data.tasks.filter((task) => task.status === 'Completed' && task.completedAt && dayDifference(task.completedAt) === 0).length;

  const countsByProperty = useMemo(() => {
    const result: Record<string, number> = {};
    data.relationships.forEach((relationship) => { result[relationship.propertyId] = (result[relationship.propertyId] ?? 0) + 1; });
    return result;
  }, [data.relationships]);

  const countsByOffer = useMemo(() => {
    const result: Record<string, number> = {};
    data.offers.forEach((offer) => { result[offer.propertyId] = (result[offer.propertyId] ?? 0) + 1; });
    return result;
  }, [data.offers]);

  const pageMeta: Record<Section, { title: string; subtitle: string }> = {
    Overview: { title: 'Good morning, Sarah', subtitle: 'Here’s what needs your attention across disposition today.' },
    Properties: { title: 'Properties', subtitle: 'Keep every deal, buyer, and next step in one place.' },
    Buyers: { title: 'Buyers', subtitle: 'Know your buyers, their buying criteria, and every open conversation.' },
    'Follow-ups': { title: 'Follow-ups', subtitle: 'A clear queue of who to contact, what to do, and when.' },
    Offers: { title: 'Offers', subtitle: 'Track every offer and negotiation from draft to decision.' },
    'Activity log': { title: 'Activity log', subtitle: 'A chronological record of what happened and when it was recorded.' },
    Reports: { title: 'Reports & analytics', subtitle: 'A practical view of follow-up execution and your disposition pipeline.' },
    Settings: { title: 'Settings', subtitle: 'Manage your workspace, team, and follow-up preferences.' },
  };

  const showToast = (message: string) => setToast(message);
  const openModal = (nextModal: ModalState) => setModal(nextModal);
  const closeModal = () => setModal(null);
  const goTo = (next: Section) => {
    setSection(next);
    setMobileNavOpen(false);
    setDrawer(null);
    setSearchOpen(false);
    setNotificationsOpen(false);
  };

  const addEvent = (event: Omit<TimelineEvent, 'id'>) => {
    setData((current) => ({ ...current, events: [{ ...event, id: id('evt') }, ...current.events] }));
  };

  const completeTask = (taskId: string) => {
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task || task.status !== 'Open') return;
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((item) => item.id === taskId ? { ...item, status: 'Completed', completedAt: now } : item),
      properties: task.propertyId ? current.properties.map((property) => property.id === task.propertyId ? { ...property, updatedAt: now } : property) : current.properties,
      relationships: current.relationships.map((relationship) => relationship.buyerId === task.buyerId && relationship.propertyId === task.propertyId && relationship.nextFollowUpAt === task.dueAt
        ? { ...relationship, nextFollowUpAt: undefined, nextAction: '' }
        : relationship),
      events: [{ id: id('evt'), buyerId: task.buyerId, propertyId: task.propertyId, kind: 'Follow-Up Completed', direction: 'Internal', occurredAt: now, recordedAt: now, content: `Completed follow-up: ${task.description}`, outcome: 'Completed', createdBy: 'Sarah Miller' }, ...current.events],
    }));
    showToast('Follow-up marked complete');
  };

  const cancelTask = (taskId: string) => {
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task || task.status !== 'Open' || !window.confirm(`Cancel this follow-up?\n\n${task.description}`)) return;
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((item) => item.id === taskId ? { ...item, status: 'Cancelled' } : item),
      relationships: current.relationships.map((relationship) => relationship.buyerId === task.buyerId && relationship.propertyId === task.propertyId && relationship.nextFollowUpAt === task.dueAt
        ? { ...relationship, nextFollowUpAt: undefined, nextAction: '' }
        : relationship),
      events: [{ id: id('evt'), buyerId: task.buyerId, propertyId: task.propertyId, kind: 'Other Interaction', direction: 'Internal', occurredAt: now, recordedAt: now, content: `Cancelled follow-up: ${task.description}`, outcome: 'Cancelled', createdBy: 'Sarah Miller' }, ...current.events],
    }));
    showToast('Follow-up cancelled');
  };

  const saveProperty = (property: Omit<Property, 'id' | 'updatedAt'>, propertyId?: string) => {
    const now = new Date().toISOString();
    if (propertyId) {
      setData((current) => ({
        ...current,
        properties: current.properties.map((item) => item.id === propertyId ? { ...item, ...property, updatedAt: now } : item),
        events: [{ id: id('evt'), propertyId, kind: 'Other Interaction', direction: 'Internal', occurredAt: now, recordedAt: now, content: 'Property record updated.', createdBy: 'Sarah Miller' }, ...current.events],
      }));
      closeModal();
      setDrawer({ type: 'property', id: propertyId });
      showToast('Property updated');
      return;
    }
    const created: Property = { ...property, id: id('prop'), updatedAt: now };
    setData((current) => ({
      ...current,
      properties: [created, ...current.properties],
      events: [{ id: id('evt'), propertyId: created.id, kind: 'Status Changed', direction: 'Internal', occurredAt: now, recordedAt: now, content: `Property added with status ${created.status}.`, createdBy: 'Sarah Miller' }, ...current.events],
    }));
    closeModal();
    setDrawer({ type: 'property', id: created.id });
    showToast('Property added to your workspace');
  };

  const saveBuyer = (buyer: Omit<Buyer, 'id' | 'color'>, buyerId?: string) => {
    if (buyerId) {
      const now = new Date().toISOString();
      setData((current) => ({
        ...current,
        buyers: current.buyers.map((item) => item.id === buyerId ? { ...item, ...buyer } : item),
        events: [{ id: id('evt'), buyerId, kind: 'Other Interaction', direction: 'Internal', occurredAt: now, recordedAt: now, content: 'Buyer profile updated.', createdBy: 'Sarah Miller' }, ...current.events],
      }));
      closeModal();
      setDrawer({ type: 'buyer', id: buyerId });
      showToast('Buyer profile updated');
      return;
    }
    const created: Buyer = { ...buyer, id: id('buyer'), color: ['sage', 'peach', 'blue', 'lavender', 'gold', 'rose', 'teal'][data.buyers.length % 7] };
    setData((current) => ({ ...current, buyers: [created, ...current.buyers] }));
    closeModal();
    setDrawer({ type: 'buyer', id: created.id });
    showToast('Buyer profile created');
  };

  const saveRelationship = (relationship: Omit<Relationship, 'id' | 'firstContactAt' | 'lastInteractionAt'>) => {
    const now = new Date().toISOString();
    const created: Relationship = { ...relationship, id: id('rel'), firstContactAt: now, lastInteractionAt: now };
    setData((current) => ({
      ...current,
      relationships: [created, ...current.relationships],
      properties: current.properties.map((property) => property.id === created.propertyId ? { ...property, updatedAt: now } : property),
      events: [{ id: id('evt'), buyerId: created.buyerId, propertyId: created.propertyId, kind: 'Other Interaction', direction: 'Internal', occurredAt: now, recordedAt: now, content: 'Buyer linked to property.', outcome: created.interestStatus, createdBy: 'Sarah Miller' }, ...current.events],
    }));
    closeModal();
    showToast('Buyer linked to property');
  };

  const saveTask = (task: Omit<FollowUp, 'id' | 'status'>, taskId?: string) => {
    const created: FollowUp = { ...task, id: taskId ?? id('task'), status: 'Open' };
    setData((current) => {
      const nextTasks = taskId
        ? current.tasks.map((item) => item.id === taskId ? { ...item, ...task, status: 'Open' as const, completedAt: undefined } : item)
        : [created, ...current.tasks];
      return {
        ...current,
        tasks: nextTasks,
        relationships: current.relationships.map((relationship) => relationship.buyerId === task.buyerId && relationship.propertyId === task.propertyId
          ? { ...relationship, nextAction: task.description, nextFollowUpAt: task.dueAt }
          : relationship),
      };
    });
    closeModal();
    showToast(taskId ? 'Follow-up updated' : created.dueAt ? 'Follow-up scheduled' : 'Follow-up added to unscheduled');
  };

  const saveOffer = (offer: Omit<Offer, 'id'>) => {
    const created: Offer = { ...offer, id: id('offer') };
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      offers: [created, ...current.offers],
      properties: current.properties.map((property) => property.id === created.propertyId ? { ...property, updatedAt: now } : property),
      events: [{ id: id('evt'), buyerId: created.buyerId, propertyId: created.propertyId, kind: 'Offer Created', direction: 'Internal', occurredAt: now, recordedAt: now, content: `${created.status} offer recorded at ${formatCurrency(created.amount)}.`, outcome: created.status, createdBy: 'Sarah Miller' }, ...current.events],
    }));
    closeModal();
    showToast('Offer recorded');
  };

  const saveInteraction = (event: Omit<TimelineEvent, 'id' | 'recordedAt' | 'createdBy'>, taskInput?: Omit<FollowUp, 'id' | 'status'>) => {
    const recordedAt = new Date().toISOString();
    setData((current) => ({
      ...current,
      properties: event.propertyId ? current.properties.map((property) => property.id === event.propertyId && new Date(event.occurredAt).getTime() > new Date(property.updatedAt).getTime() ? { ...property, updatedAt: event.occurredAt } : property) : current.properties,
      events: [{ ...event, id: id('evt'), recordedAt, createdBy: 'Sarah Miller' }, ...current.events],
      relationships: current.relationships.map((relationship) => relationship.buyerId === event.buyerId && relationship.propertyId === event.propertyId ? { ...relationship, lastInteractionAt: event.occurredAt, nextAction: taskInput?.description ?? relationship.nextAction, nextFollowUpAt: taskInput?.dueAt ?? relationship.nextFollowUpAt } : relationship),
      tasks: taskInput ? [{ ...taskInput, id: id('task'), status: 'Open' }, ...current.tasks] : current.tasks,
    }));
    closeModal();
    showToast(taskInput ? 'Interaction logged and follow-up created' : 'Interaction logged');
  };

  const updatePropertyStatus = (propertyId: string, status: PropertyStatus) => {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      properties: current.properties.map((property) => property.id === propertyId ? { ...property, status, updatedAt: now } : property),
      events: [{ id: id('evt'), propertyId, kind: 'Status Changed', direction: 'Internal', occurredAt: now, recordedAt: now, content: `Property status changed to ${status}.`, outcome: status, createdBy: 'Sarah Miller' }, ...current.events],
    }));
    showToast(`Property moved to ${status}`);
  };

  const addNav = (next: Section) => goTo(next);
  const currentMeta = pageMeta[section];

  const filteredProperties = data.properties.filter((property) => {
    const text = `${property.address} ${property.city} ${property.state} ${property.zip}`.toLowerCase();
    return text.includes(propertySearch.toLowerCase()) && (propertyFilter === 'All statuses' || property.status === propertyFilter);
  });

  const filteredBuyers = data.buyers.filter((buyer) => {
    const text = `${buyer.name} ${buyer.company} ${buyer.phone} ${buyer.email} ${buyer.markets.join(' ')}`.toLowerCase();
    return text.includes(buyerSearch.toLowerCase()) && (buyerFilter === 'All buyers' || buyer.status === buyerFilter);
  });

  const allSearchResults = searchText.trim() ? [
    ...data.properties.filter((property) => `${property.address} ${property.city} ${property.state} ${property.zip}`.toLowerCase().includes(searchText.toLowerCase())).slice(0, 3).map((property) => ({ type: 'property' as const, id: property.id, title: property.address, subtitle: `${property.city}, ${property.state} · ${property.status}` })),
    ...data.buyers.filter((buyer) => `${buyer.name} ${buyer.company} ${buyer.phone} ${buyer.email}`.toLowerCase().includes(searchText.toLowerCase())).slice(0, 3).map((buyer) => ({ type: 'buyer' as const, id: buyer.id, title: buyer.name, subtitle: `${buyer.company} · ${buyer.status}` })),
  ] : [];

  const unreadAlerts = overdueTasks.length + openOffers.filter((offer) => offer.status === 'Submitted' || offer.status === 'Countered').length;

  const openProperty = (propertyId: string) => setDrawer({ type: 'property', id: propertyId });
  const openBuyer = (buyerId: string, propertyId?: string) => setDrawer({ type: 'buyer', id: buyerId, propertyId });
  const selectedProperty = drawer?.type === 'property' ? data.properties.find((property) => property.id === drawer.id) : undefined;
  const selectedBuyer = drawer?.type === 'buyer' ? data.buyers.find((buyer) => buyer.id === drawer.id) : undefined;

  const pageAction = () => {
    switch (section) {
      case 'Properties': return <button className="button button-primary" onClick={() => openModal({ type: 'property' })}><Plus size={16} /> Add property</button>;
      case 'Buyers': return <button className="button button-primary" onClick={() => openModal({ type: 'buyer' })}><Plus size={16} /> Add buyer</button>;
      case 'Follow-ups': return <button className="button button-primary" onClick={() => openModal({ type: 'task' })}><Plus size={16} /> New follow-up</button>;
      case 'Offers': return <button className="button button-primary" onClick={() => openModal({ type: 'offer' })}><Plus size={16} /> Add offer</button>;
      case 'Activity log': return <button className="button button-primary" onClick={() => openModal({ type: 'interaction' })}><Plus size={16} /> Log interaction</button>;
      case 'Overview': return <><button className="button button-secondary" onClick={() => openModal({ type: 'interaction' })}><MessageSquareText size={16} /> Log interaction</button><button className="button button-primary" onClick={() => openModal({ type: 'property' })}><Plus size={16} /> Add property</button></>;
      case 'Reports': return <button className="button button-secondary" onClick={() => showToast('Report export is available in the full workspace.')}><Download size={16} /> Export report</button>;
      default: return null;
    }
  };

  const navGroups: { label?: string; items: { name: Section; icon: IconComponent; badge?: number }[] }[] = [
    { items: [
      { name: 'Overview', icon: LayoutDashboard },
      { name: 'Properties', icon: Home },
      { name: 'Buyers', icon: Users },
      { name: 'Follow-ups', icon: CalendarCheck, badge: overdueTasks.length + dueTodayTasks.length },
      { name: 'Offers', icon: FileText },
      { name: 'Activity log', icon: Activity },
    ] },
    { label: 'WORKSPACE', items: [{ name: 'Reports', icon: TrendingUp }] },
  ];

  return (
    <div className="app-shell">
      {mobileNavOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><span className="brand-mark-top" /><span className="brand-mark-bottom" /></div>
          <div className="brand-wordmark">dispo<span>flow</span><sup>AI</sup></div>
          <button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X size={17} /></button>
        </div>
        <button className="workspace-switcher" onClick={() => showToast('Workspace switcher is ready for multi-company accounts.') }>
          <span className="workspace-avatar">W</span>
          <span className="workspace-copy"><strong>Waypoint Investments</strong><small>Workspace</small></span>
          <ChevronDown size={15} className="workspace-chevron" />
        </button>
        <div className="nav-scroll">
          {navGroups.map((group, index) => (
            <div className="nav-group" key={group.label ?? `main-${index}`}>
              {group.label && <div className="nav-group-label">{group.label}</div>}
              {group.items.map(({ name, icon: Icon, badge }) => (
                <button key={name} className={`nav-item ${section === name ? 'nav-active' : ''}`} onClick={() => addNav(name)}>
                  <Icon size={17} strokeWidth={1.9} />
                  <span>{name}</span>
                  {badge ? <span className="nav-count">{badge}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <button className={`nav-item ${section === 'Settings' ? 'nav-active' : ''}`} onClick={() => addNav('Settings')}><Settings size={17} /><span>Settings</span></button>
          <button className="nav-item" onClick={() => openModal({ type: 'help' })}><HelpCircle size={17} /><span>Help & support</span><ArrowUpRight size={13} className="nav-external" /></button>
          <div className="sidebar-divider" />
          <button className="profile-row" onClick={() => { setSettingsTab('Team'); goTo('Settings'); }}>
            <Avatar name="Sarah Miller" color="mint" size="small" />
            <span className="profile-meta"><strong>Sarah Miller</strong><small>Owner · Admin</small></span>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>

      <main className="main-shell">
        <div className="demo-mode-banner" role="status" aria-label="Demo Mode: fictitious data stored only in this browser; no messages are sent; do not enter real data.">
          <span className="demo-mode-dot" aria-hidden="true" />
          <strong>DEMO MODE</strong>
          <span>Fictitious data · stored only in this browser · no messages are sent · do not enter real data</span>
        </div>
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="breadcrumbs"><span>Waypoint Investments</span><ChevronRight size={14} /><strong>{section}</strong></div>
          <div className="topbar-actions">
            <button className={`global-search ${searchOpen ? 'global-search-open' : ''}`} onClick={() => setSearchOpen((open) => !open)}>
              <Search size={16} /><span>Search properties, buyers...</span><kbd>⌘ K</kbd>
            </button>
            <div className="popover-anchor">
              <button className={`icon-button notification-button ${notificationsOpen ? 'icon-button-on' : ''}`} aria-label="Notifications" onClick={() => { setNotificationsOpen((open) => !open); setSearchOpen(false); }}>
                <Bell size={18} />{unreadAlerts > 0 && <i className="notification-dot" />}
              </button>
              {notificationsOpen && <div className="notification-popover">
                <div className="popover-title"><strong>Needs your attention</strong><span>{unreadAlerts} items</span></div>
                {overdueTasks.slice(0, 2).map((task) => {
                  const buyer = data.buyers.find((item) => item.id === task.buyerId);
                  return <button key={task.id} className="notification-row" onClick={() => { setTaskFilter('Overdue'); goTo('Follow-ups'); }}><span className="notification-icon notification-red"><Clock3 size={15} /></span><span><strong>Overdue follow-up</strong><small>{buyer?.name} · {task.description}</small></span><ChevronRight size={15} /></button>;
                })}
                {openOffers.filter((offer) => ['Submitted', 'Countered'].includes(offer.status)).slice(0, 1).map((offer) => {
                  const property = data.properties.find((item) => item.id === offer.propertyId);
                  return <button key={offer.id} className="notification-row" onClick={() => goTo('Offers')}><span className="notification-icon notification-green"><CircleDollarSign size={15} /></span><span><strong>Offer needs a response</strong><small>{property?.address} · {formatCurrency(offer.amount)}</small></span><ChevronRight size={15} /></button>;
                })}
                <button className="popover-footer-link" onClick={() => { setTaskFilter('Overdue'); goTo('Follow-ups'); }}>View follow-up queue <ArrowRight size={14} /></button>
              </div>}
            </div>
            <div className="topbar-profile"><Avatar name="Sarah Miller" color="mint" size="small" /><span>Sarah Miller</span><ChevronDown size={14} /></div>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">DISPOSITION WORKSPACE <span className="eyebrow-dot" /> {section === 'Overview' ? formatDate(new Date().toISOString(), { weekday: 'long', month: 'long', day: 'numeric' }) : 'WAYPOINT INVESTMENTS'}</div>
              <h1>{currentMeta.title}</h1>
              <p>{currentMeta.subtitle}</p>
            </div>
            <div className="page-actions">{pageAction()}</div>
          </div>

          {section === 'Overview' && <Dashboard
            data={data}
            activeProperties={activeProperties}
            activeBuyers={activeBuyers}
            activeTasks={activeTasks}
            overdueTasks={overdueTasks}
            dueTodayTasks={dueTodayTasks}
            upcomingTasks={upcomingTasks}
            openOffers={openOffers}
            completedToday={completedToday}
            countsByProperty={countsByProperty}
            countsByOffer={countsByOffer}
            onTaskDone={completeTask}
            onViewFollowups={(filter) => { setTaskFilter(filter); goTo('Follow-ups'); }}
            onProperty={openProperty}
            onBuyer={openBuyer}
            onSection={goTo}
            onGenerate={() => {
              const candidate = data.relationships.find((relationship) => data.buyers.find((buyer) => buyer.id === relationship.buyerId)?.status === 'Active');
              if (candidate) openModal({ type: 'message', buyerId: candidate.buyerId, propertyId: candidate.propertyId });
              else showToast('Link an active buyer to a property to generate a contextual draft.');
            }}
          />}

          {section === 'Properties' && <PropertiesPage
            properties={filteredProperties}
            allCount={data.properties.length}
            propertySearch={propertySearch}
            setPropertySearch={setPropertySearch}
            propertyFilter={propertyFilter}
            setPropertyFilter={setPropertyFilter}
            countsByProperty={countsByProperty}
            countsByOffer={countsByOffer}
            relationships={data.relationships}
            openProperty={openProperty}
            onAdd={() => openModal({ type: 'property' })}
          />}

          {section === 'Buyers' && <BuyersPage
            buyers={filteredBuyers}
            allCount={data.buyers.length}
            buyerSearch={buyerSearch}
            setBuyerSearch={setBuyerSearch}
            buyerFilter={buyerFilter}
            setBuyerFilter={setBuyerFilter}
            relationships={data.relationships}
            offers={data.offers}
            tasks={data.tasks}
            events={data.events}
            properties={data.properties}
            openBuyer={openBuyer}
            onAdd={() => openModal({ type: 'buyer' })}
          />}

          {section === 'Follow-ups' && <FollowUpsPage
            tasks={data.tasks}
            buyers={data.buyers}
            properties={data.properties}
            relationships={data.relationships}
            filter={taskFilter}
            setFilter={setTaskFilter}
            teamView={teamView}
            setTeamView={setTeamView}
            onComplete={completeTask}
            onCancel={cancelTask}
            onBuyer={(buyerId, propertyId) => openBuyer(buyerId, propertyId)}
            onProperty={openProperty}
            onAdd={() => openModal({ type: 'task' })}
            onSchedule={(task) => openModal({ type: 'task', buyerId: task.buyerId, propertyId: task.propertyId, taskId: task.fromRelationship ? undefined : task.id, description: task.description })}
            onMessage={(buyerId, propertyId) => openModal({ type: 'message', buyerId, propertyId })}
          />}

          {section === 'Offers' && <OffersPage data={data} onBuyer={openBuyer} onProperty={openProperty} onAdd={() => openModal({ type: 'offer' })} />}

          {section === 'Activity log' && <ActivityPage
            events={data.events}
            buyers={data.buyers}
            properties={data.properties}
            filter={activityFilter}
            setFilter={setActivityFilter}
            onBuyer={openBuyer}
            onProperty={openProperty}
          />}

          {section === 'Reports' && <ReportsPage data={data} period={reportPeriod} setPeriod={setReportPeriod} />}

          {section === 'Settings' && <SettingsPage
            tab={settingsTab}
            setTab={setSettingsTab}
            notificationPreference={notificationPreference}
            setNotificationPreference={setNotificationPreference}
            aiPreference={aiPreference}
            setAiPreference={setAiPreference}
            onReset={() => { window.localStorage.removeItem(STORAGE_KEY); setData(createDemoData()); showToast('Demo workspace restored to sample data'); }}
            showToast={showToast}
          />}
        </div>
      </main>

      {searchOpen && <div className="search-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
        <div className="search-dialog">
          <div className="search-dialog-input"><Search size={18} /><input autoFocus placeholder="Search properties, buyers, or companies..." value={searchText} onChange={(event) => setSearchText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); }} /><kbd>ESC</kbd></div>
          {searchText.trim() ? <div className="search-results">
            {allSearchResults.length ? allSearchResults.map((result) => <button key={`${result.type}-${result.id}`} className="search-result" onClick={() => { setSearchOpen(false); setSearchText(''); result.type === 'property' ? openProperty(result.id) : openBuyer(result.id); }}><span className="search-result-icon">{result.type === 'property' ? <Home size={16} /> : <Users size={16} />}</span><span><strong>{result.title}</strong><small>{result.subtitle}</small></span><ArrowUpRight size={15} /></button>) : <div className="search-no-results">No matches yet. Try a name, street, or company.</div>}
          </div> : <div className="search-hint"><span><kbd>↵</kbd> Open result</span><span><kbd>esc</kbd> Close</span><small>Search across your buyers and properties</small></div>}
        </div>
      </div>}

      {drawer && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}>
        <aside className="detail-drawer">
          {drawer.type === 'property' && selectedProperty && <PropertyDrawer
            property={selectedProperty}
            data={data}
            countsByOffer={countsByOffer}
            onClose={() => setDrawer(null)}
            onBuyer={openBuyer}
            onAddBuyer={() => openModal({ type: 'relationship', propertyId: selectedProperty.id })}
            onInteraction={() => openModal({ type: 'interaction', propertyId: selectedProperty.id })}
            onTask={() => openModal({ type: 'task', propertyId: selectedProperty.id })}
            onOffer={() => openModal({ type: 'offer', propertyId: selectedProperty.id })}
            onMessage={(buyerId) => openModal({ type: 'message', buyerId, propertyId: selectedProperty.id })}
            onStatus={(status) => updatePropertyStatus(selectedProperty.id, status)}
            onEdit={() => openModal({ type: 'edit-property', id: selectedProperty.id })}
            onHistory={() => goTo('Activity log')}
          />}
          {drawer.type === 'buyer' && selectedBuyer && <BuyerDrawer
            buyer={selectedBuyer}
            data={data}
            propertyId={drawer.propertyId}
            onClose={() => setDrawer(null)}
            onProperty={openProperty}
            onInteraction={(propertyId) => openModal({ type: 'interaction', buyerId: selectedBuyer.id, propertyId })}
            onTask={(propertyId) => openModal({ type: 'task', buyerId: selectedBuyer.id, propertyId })}
            onOffer={(propertyId) => openModal({ type: 'offer', buyerId: selectedBuyer.id, propertyId })}
            onLinkProperty={() => openModal({ type: 'relationship', buyerId: selectedBuyer.id })}
            onMessage={(propertyId) => openModal({ type: 'message', buyerId: selectedBuyer.id, propertyId })}
            onEdit={() => openModal({ type: 'edit-buyer', id: selectedBuyer.id })}
            onHistory={() => goTo('Activity log')}
          />}
        </aside>
      </div>}

      {modal && <ModalHost
        modal={modal}
        data={data}
        close={closeModal}
        onSaveProperty={saveProperty}
        onSaveBuyer={saveBuyer}
        onSaveRelationship={saveRelationship}
        onSaveTask={saveTask}
        onSaveOffer={saveOffer}
        onSaveInteraction={saveInteraction}
        showToast={showToast}
      />}
      {toast && <div className="toast-message"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  );
}

function Dashboard({
  data, activeProperties, activeBuyers, activeTasks, overdueTasks, dueTodayTasks, upcomingTasks, openOffers, completedToday, countsByProperty, countsByOffer, onTaskDone, onViewFollowups, onProperty, onBuyer, onSection, onGenerate,
}: {
  data: WorkspaceData; activeProperties: Property[]; activeBuyers: Buyer[]; activeTasks: FollowUp[]; overdueTasks: FollowUp[]; dueTodayTasks: FollowUp[]; upcomingTasks: FollowUp[]; openOffers: Offer[]; completedToday: number; countsByProperty: Record<string, number>; countsByOffer: Record<string, number>; onTaskDone: (id: string) => void; onViewFollowups: (filter: string) => void; onProperty: (id: string) => void; onBuyer: (id: string, propertyId?: string) => void; onSection: (section: Section) => void; onGenerate: () => void;
}) {
  const attentionTasks = [...overdueTasks, ...dueTodayTasks].sort((a, b) => {
    const priorityRank = (priority: FollowUp['priority']) => priority === 'High' ? 0 : priority === 'Normal' ? 1 : 2;
    return priorityRank(a.priority) - priorityRank(b.priority) || new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime();
  }).slice(0, 4);
  const pipelineStatuses: PropertyStatus[] = ['Marketing', 'Offer Received', 'Under Contract', 'Pending', 'Available'];
  const pipelineColors: Record<string, string> = { Marketing: 'var(--green-600)', 'Offer Received': 'var(--blue-500)', 'Under Contract': 'var(--amber-500)', Pending: 'var(--violet-500)', Available: 'var(--slate-400)' };
  const visibleProperty = data.properties.filter((property) => !['Sold', 'Cancelled'].includes(property.status)).slice(0, 4);
  const totalPipeline = pipelineStatuses.reduce((sum, status) => sum + data.properties.filter((property) => property.status === status).length, 0) || 1;
  const todayString = formatDate(new Date().toISOString(), { month: 'long', day: 'numeric' });

  return (
    <div className="dashboard-grid">
      <section className="welcome-strip">
        <div className="welcome-copy"><span className="welcome-kicker"><span className="pulse-dot" /> TODAY AT A GLANCE</span><strong>{overdueTasks.length ? `${overdueTasks.length} follow-ups are past due.` : 'Your follow-up queue is clear.'}</strong><span>Keep the momentum going — there are {dueTodayTasks.length} buyer conversations to pick up today.</span></div>
        <div className="welcome-right"><span className="welcome-date"><Calendar size={15} /> {todayString}</span><button className="button button-welcome" onClick={() => onViewFollowups(overdueTasks.length ? 'Overdue' : 'Due today')}>Review queue <ArrowRight size={15} /></button></div>
        <div className="welcome-art"><span className="art-ring ring-one" /><span className="art-ring ring-two" /><span className="art-spark">✳</span></div>
      </section>

      <section className="metric-grid">
        <MetricCard label="Overdue follow-ups" value={String(overdueTasks.length)} detail={overdueTasks.length ? 'Needs a touch today' : 'All caught up'} icon={Clock3} tone="red" trend={overdueTasks.length ? 'Action needed' : 'Looking good'} onClick={() => onViewFollowups('Overdue')} />
        <MetricCard label="Due today" value={String(dueTodayTasks.length)} detail={`${completedToday} completed today`} icon={CalendarCheck} tone="amber" trend={completedToday ? `${completedToday} done` : 'On your list'} onClick={() => onViewFollowups('Due today')} />
        <MetricCard label="Active properties" value={String(activeProperties.length)} detail={`${data.properties.filter((item) => item.status === 'Marketing').length} currently marketing`} icon={Building2} tone="green" trend={`${data.properties.length} total`} onClick={() => onSection('Properties')} />
        <MetricCard label="Open offers" value={String(openOffers.length)} detail="Across active properties" icon={CircleDollarSign} tone="blue" trend={openOffers.some((offer) => offer.status === 'Submitted') ? 'Needs attention' : 'In progress'} onClick={() => onSection('Offers')} />
      </section>

      <div className="dashboard-main-grid">
        <section className="panel queue-panel">
          <CardHeading title="Your follow-up queue" subtitle="The conversations that need a next step." action={<button className="text-link" onClick={() => onViewFollowups('All')}>View all <ArrowRight size={14} /></button>} />
          {attentionTasks.length ? <div className="queue-list">
            {attentionTasks.map((task) => {
              const buyer = data.buyers.find((item) => item.id === task.buyerId);
              const property = data.properties.find((item) => item.id === task.propertyId);
              const bucket = getTaskBucket(task);
              return <div className="queue-row" key={task.id}>
                <button className="queue-check" aria-label={`Complete ${task.description}`} onClick={() => onTaskDone(task.id)}><Check size={14} /></button>
                <button className="queue-main" onClick={() => buyer && onBuyer(buyer.id, property?.id)}>
                  <span className="queue-person-line"><strong>{buyer?.name ?? 'Buyer'}</strong><span className={`priority-dot priority-${task.priority.toLowerCase()}`} /></span>
                  <span className="queue-task-text">{task.description}</span>
                  <span className="queue-property"><MapPin size={12} /> {property?.address ?? 'General follow-up'}</span>
                </button>
                <div className="queue-time"><StatusBadge tone={bucket === 'Overdue' ? 'overdue' : 'due-today'}>{bucket === 'Overdue' ? 'Overdue' : formatDateTime(task.dueAt)}</StatusBadge><span>{task.assignedTo.split(' ')[0]}</span></div>
              </div>;
            })}
          </div> : <EmptyState icon={CheckCheck} title="You're all caught up" description="No urgent follow-ups right now. Check your upcoming queue to plan ahead." action={<button className="text-link" onClick={() => onViewFollowups('Upcoming')}>See upcoming <ArrowRight size={14} /></button>} />}
          <div className="queue-summary"><span><i className="legend-dot legend-red" />{overdueTasks.length} overdue</span><span><i className="legend-dot legend-amber" />{dueTodayTasks.length} due today</span><span><i className="legend-dot legend-green" />{upcomingTasks.length} upcoming</span><span><i className="legend-dot legend-gray" />{activeTasks.filter((task) => !task.dueAt).length} unscheduled</span></div>
        </section>

        <section className="panel pipeline-panel">
          <CardHeading title="Disposition snapshot" subtitle="Active property pipeline" action={<button className="icon-button quiet-icon" aria-label="View properties" onClick={() => onSection('Properties')}><ArrowUpRight size={16} /></button>} />
          <div className="pipeline-total"><strong>{activeProperties.length}</strong><span>active properties</span><small><TrendingUp size={13} /> {activeBuyers.length} active buyers</small></div>
          <div className="pipeline-bars">
            {pipelineStatuses.map((status) => {
              const count = data.properties.filter((property) => property.status === status).length;
              return <div className="pipeline-row" key={status}><span>{status}</span><div className="pipeline-track"><span style={{ width: `${Math.max((count / totalPipeline) * 100, count ? 12 : 0)}%`, background: pipelineColors[status] }} /></div><strong>{count}</strong></div>;
            })}
          </div>
          <div className="pipeline-footer"><span><span className="mini-avatar-stack"><Avatar name="Sarah Miller" color="mint" size="small" /><Avatar name="Michael Reed" color="blue" size="small" /></span> Team activity</span><button className="text-link" onClick={() => onSection('Reports')}>View insights <ArrowRight size={14} /></button></div>
        </section>
      </div>

      <div className="dashboard-bottom-grid">
        <section className="panel recent-properties-panel">
          <CardHeading title="Recently updated properties" subtitle="The deals your team has touched most recently." action={<button className="text-link" onClick={() => onSection('Properties')}>All properties <ArrowRight size={14} /></button>} />
          <div className="compact-property-list">
            {visibleProperty.map((property) => {
              const buyerCount = countsByProperty[property.id] ?? 0;
              const offerCount = countsByOffer[property.id] ?? 0;
              return <button className="compact-property-row" key={property.id} onClick={() => onProperty(property.id)}>
                <span className="property-symbol"><Home size={17} /></span>
                <span className="compact-address"><strong>{property.address}</strong><small>{property.city}, {property.state} {property.zip}</small></span>
                <StatusBadge>{property.status}</StatusBadge>
                <span className="compact-property-metrics"><span><Users size={13} />{buyerCount}</span><span><CircleDollarSign size={13} />{offerCount}</span></span>
                <span className="compact-price">{formatCurrency(property.askingPrice)}</span>
                <ChevronRight size={15} className="row-chevron" />
              </button>;
            })}
          </div>
        </section>

        <section className="ai-assist-card">
          <div className="ai-card-top"><span className="ai-orb"><Sparkles size={17} /></span><span className="ai-label">DISPOFLOW AI <i>PREVIEW</i></span><span className="ai-card-more"><MoreHorizontal size={18} /></span></div>
          <h2>Make your next follow-up feel effortless.</h2>
          <p>Draft a message with the buyer’s real conversation history in context. You review every word before it goes anywhere.</p>
          <div className="ai-context-preview"><span className="context-line"><i /> Marcus asked to review the numbers with his partner</span><span className="context-line"><i /> 1842 W 44th St · Price concern</span></div>
          <button className="button button-ai" onClick={onGenerate}><Sparkles size={15} /> Draft a follow-up <ArrowRight size={14} /></button>
          <div className="ai-disclaimer"><CheckCircle2 size={13} /> Nothing is sent automatically</div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone, trend, onClick }: { label: string; value: string; detail: string; icon: IconComponent; tone: string; trend: string; onClick: () => void }) {
  return <button className={`metric-card metric-${tone}`} onClick={onClick}>
    <div className="metric-top"><span className="metric-label">{label}</span><span className="metric-icon"><Icon size={17} /></span></div>
    <div className="metric-number-row"><strong>{value}</strong><span className="metric-trend">{tone === 'red' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{trend}</span></div>
    <span className="metric-detail">{detail}</span>
  </button>;
}

function PropertiesPage({ properties, allCount, propertySearch, setPropertySearch, propertyFilter, setPropertyFilter, countsByProperty, countsByOffer, relationships, openProperty, onAdd }: {
  properties: Property[]; allCount: number; propertySearch: string; setPropertySearch: (value: string) => void; propertyFilter: string; setPropertyFilter: (value: string) => void; countsByProperty: Record<string, number>; countsByOffer: Record<string, number>; relationships: Relationship[]; openProperty: (id: string) => void; onAdd: () => void;
}) {
  const marketing = properties.filter((item) => item.status === 'Marketing').length;
  const underContract = properties.filter((item) => ['Under Contract', 'Pending'].includes(item.status)).length;
  const currentBuyerLinks = relationships.length;
  return <div className="content-stack">
    <div className="mini-stat-strip"><MiniStat label="Total properties" value={String(allCount)} accent="green" /><MiniStat label="Currently marketing" value={String(marketing)} accent="blue" /><MiniStat label="Under contract" value={String(underContract)} accent="amber" /><MiniStat label="Buyer relationships" value={String(currentBuyerLinks)} accent="violet" /></div>
    <section className="panel table-panel">
      <div className="table-toolbar"><div className="table-toolbar-title"><h2>Property inventory <span>{properties.length}</span></h2><p>One source of truth for every active deal.</p></div><div className="table-tools"><div className="input-search"><Search size={15} /><input placeholder="Search address, city, ZIP..." value={propertySearch} onChange={(event) => setPropertySearch(event.target.value)} /><kbd>/</kbd></div><label className="select-shell"><Filter size={14} /><select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)}><option>All statuses</option>{propertyStatuses.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={13} /></label><button className="button button-primary button-small" onClick={onAdd}><Plus size={15} /> Add property</button></div></div>
      <div className="responsive-table"><table className="data-table property-table"><thead><tr><th>Property</th><th>Status</th><th>Asking price</th><th>Buyers</th><th>Offers</th><th>Last activity</th><th>Next follow-up</th><th /></tr></thead><tbody>
        {properties.map((property) => {
          const nextTask = relationships.filter((relationship) => relationship.propertyId === property.id && relationship.nextFollowUpAt).sort((a, b) => new Date(a.nextFollowUpAt!).getTime() - new Date(b.nextFollowUpAt!).getTime())[0];
          return <tr key={property.id} onClick={() => openProperty(property.id)}>
            <td><div className="property-cell"><span className="property-thumb"><Home size={16} /></span><span><strong>{property.address}</strong><small>{property.city}, {property.state} {property.zip}</small></span></div></td>
            <td><StatusBadge>{property.status}</StatusBadge></td><td className="amount-cell">{formatCurrency(property.askingPrice)}</td><td><span className="table-count"><Users size={14} />{countsByProperty[property.id] ?? 0}</span></td><td><span className="table-count"><CircleDollarSign size={14} />{countsByOffer[property.id] ?? 0}</span></td><td className="muted-cell">{formatDate(property.updatedAt, { month: 'short', day: 'numeric' })}</td><td className="muted-cell">{nextTask?.nextFollowUpAt ? formatDate(nextTask.nextFollowUpAt, { month: 'short', day: 'numeric' }) : '—'}</td><td><ChevronRight size={15} className="row-chevron" /></td>
          </tr>;
        })}
      </tbody></table></div>
      {properties.length === 0 && <EmptyState icon={Home} title="No properties match" description="Try another search or clear your status filter." />}
      <div className="table-footer"><span>Showing <strong>{properties.length ? 1 : 0}–{properties.length}</strong> of <strong>{properties.length}</strong> properties</span><div><button className="pagination-button" disabled><ChevronRight size={15} className="rotate-left" /></button><button className="pagination-button" disabled><ChevronRight size={15} /></button></div></div>
    </section>
    <div className="table-note"><span className="info-badge"><AlertCircle size={14} /></span><span>Duplicate check uses normalized address matching in this demo. Review matching records before importing a larger list.</span></div>
  </div>;
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return <div className={`mini-stat mini-${accent}`}><span className="mini-stat-mark" /><span><small>{label}</small><strong>{value}</strong></span></div>;
}

function BuyersPage({ buyers, allCount, buyerSearch, setBuyerSearch, buyerFilter, setBuyerFilter, relationships, offers, tasks, events, properties, openBuyer, onAdd }: {
  buyers: Buyer[]; allCount: number; buyerSearch: string; setBuyerSearch: (value: string) => void; buyerFilter: string; setBuyerFilter: (value: string) => void; relationships: Relationship[]; offers: Offer[]; tasks: FollowUp[]; events: TimelineEvent[]; properties: Property[]; openBuyer: (id: string, propertyId?: string) => void; onAdd: () => void;
}) {
  const activeCount = buyers.filter((buyer) => buyer.status === 'Active').length;
  const linkedCount = relationships.length;
  const buyersWithOffers = new Set(offers.filter((offer) => ['Draft', 'Submitted', 'Under Review', 'Countered'].includes(offer.status)).map((offer) => offer.buyerId)).size;
  return <div className="content-stack">
    <div className="mini-stat-strip"><MiniStat label="Total buyers" value={String(allCount)} accent="green" /><MiniStat label="Active buyers" value={String(activeCount)} accent="blue" /><MiniStat label="Property interests" value={String(linkedCount)} accent="violet" /><MiniStat label="Buyers with open offers" value={String(buyersWithOffers)} accent="amber" /></div>
    <section className="panel table-panel">
      <div className="table-toolbar"><div className="table-toolbar-title"><h2>Buyer directory <span>{buyers.length}</span></h2><p>Contact profiles with property-specific history.</p></div><div className="table-tools"><div className="input-search"><Search size={15} /><input placeholder="Name, phone, email, company..." value={buyerSearch} onChange={(event) => setBuyerSearch(event.target.value)} /><kbd>/</kbd></div><label className="select-shell"><Filter size={14} /><select value={buyerFilter} onChange={(event) => setBuyerFilter(event.target.value)}><option>All buyers</option>{buyerStatuses.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={13} /></label><button className="button button-primary button-small" onClick={onAdd}><Plus size={15} /> Add buyer</button></div></div>
      <div className="responsive-table"><table className="data-table buyer-table"><thead><tr><th>Buyer</th><th>Contact</th><th>Preferred markets</th><th>Status</th><th>Properties</th><th>Open offers</th><th>Last contact</th><th>Next follow-up</th><th /></tr></thead><tbody>
        {buyers.map((buyer) => {
          const linked = relationships.filter((relationship) => relationship.buyerId === buyer.id);
          const buyerOffers = offers.filter((offer) => offer.buyerId === buyer.id && ['Draft', 'Submitted', 'Under Review', 'Countered'].includes(offer.status));
          const lastEvent = events.filter((event) => event.buyerId === buyer.id).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0];
          const nextTask = tasks.filter((task) => task.buyerId === buyer.id && task.status === 'Open' && task.dueAt).sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())[0];
          return <tr key={buyer.id} onClick={() => openBuyer(buyer.id)}>
            <td><div className="buyer-cell"><Avatar name={buyer.name} color={buyer.color} size="small" /><span><strong>{buyer.name}</strong><small>{buyer.company}</small></span></div></td>
            <td><span className="buyer-contact-cell">{buyer.phone}<small>{buyer.email}</small></span></td>
            <td><span className="market-tags">{buyer.markets.slice(0, 2).map((market) => <i key={market}>{market}</i>)}{buyer.markets.length > 2 && <i>+{buyer.markets.length - 2}</i>}</span></td>
            <td><StatusBadge>{buyer.status}</StatusBadge></td><td><span className="table-count"><Home size={14} />{linked.length}</span></td><td><span className="table-count"><CircleDollarSign size={14} />{buyerOffers.length}</span></td><td className="muted-cell">{lastEvent ? formatDate(lastEvent.occurredAt, { month: 'short', day: 'numeric' }) : '—'}</td><td className="muted-cell">{nextTask ? formatDate(nextTask.dueAt, { month: 'short', day: 'numeric' }) : '—'}</td><td><ChevronRight size={15} className="row-chevron" /></td>
          </tr>;
        })}
      </tbody></table></div>
      {buyers.length === 0 && <EmptyState icon={Users} title="No buyers match" description="Try a different search or buyer status." />}
      <div className="table-footer"><span>Showing <strong>{buyers.length ? 1 : 0}–{buyers.length}</strong> of <strong>{buyers.length}</strong> buyers</span><div><button className="pagination-button" disabled><ChevronRight size={15} className="rotate-left" /></button><button className="pagination-button" disabled><ChevronRight size={15} /></button></div></div>
    </section>
  </div>;
}

function FollowUpsPage({ tasks, buyers, properties, relationships, filter, setFilter, teamView, setTeamView, onComplete, onCancel, onBuyer, onProperty, onAdd, onSchedule, onMessage }: {
  tasks: FollowUp[]; buyers: Buyer[]; properties: Property[]; relationships: Relationship[]; filter: string; setFilter: (value: string) => void; teamView: 'My work' | 'Everyone'; setTeamView: (value: 'My work' | 'Everyone') => void; onComplete: (id: string) => void; onCancel: (id: string) => void; onBuyer: (buyerId: string, propertyId?: string) => void; onProperty: (propertyId: string) => void; onAdd: () => void; onSchedule: (task: FollowUp) => void; onMessage: (buyerId: string, propertyId?: string) => void;
}) {
  const open = tasks.filter((task) => task.status === 'Open');
  const scopedOpen = teamView === 'My work' ? open.filter((task) => task.assignedTo === 'Sarah Miller') : open;
  const representedPairs = new Set(open.filter((task) => task.propertyId).map((task) => `${task.buyerId}:${task.propertyId}`));
  const unscheduledRelationships = relationships.filter((relationship) => !relationship.nextFollowUpAt && relationship.nextAction && !representedPairs.has(`${relationship.buyerId}:${relationship.propertyId}`) && buyers.find((buyer) => buyer.id === relationship.buyerId)?.status === 'Active');
  const relationshipSuggestions: FollowUp[] = unscheduledRelationships.map((relationship) => ({ id: `suggestion-${relationship.id}`, buyerId: relationship.buyerId, propertyId: relationship.propertyId, description: relationship.nextAction, assignedTo: 'Sarah Miller', priority: 'Normal', status: 'Open', fromRelationship: true }));
  const counts = {
    All: scopedOpen.length,
    Overdue: scopedOpen.filter((task) => getTaskBucket(task) === 'Overdue').length,
    'Due today': scopedOpen.filter((task) => getTaskBucket(task) === 'Due today').length,
    Upcoming: scopedOpen.filter((task) => getTaskBucket(task) === 'Upcoming').length,
    Unscheduled: scopedOpen.filter((task) => getTaskBucket(task) === 'Unscheduled').length + relationshipSuggestions.length,
    Completed: tasks.filter((task) => task.status === 'Completed' && (teamView === 'Everyone' || task.assignedTo === 'Sarah Miller')).length,
  };
  const tabs = Object.keys(counts);
  const baseList = filter === 'Completed'
    ? tasks.filter((task) => task.status === 'Completed' && (teamView === 'Everyone' || task.assignedTo === 'Sarah Miller'))
    : filter === 'All'
      ? scopedOpen
      : filter === 'Unscheduled'
        ? [...scopedOpen.filter((task) => getTaskBucket(task) === 'Unscheduled'), ...relationshipSuggestions]
        : scopedOpen.filter((task) => getTaskBucket(task) === filter);
  const list = [...baseList].sort((a, b) => {
    const order = (task: FollowUp) => task.status === 'Completed' ? 4 : getTaskBucket(task) === 'Overdue' ? 0 : getTaskBucket(task) === 'Due today' ? 1 : getTaskBucket(task) === 'Upcoming' ? 2 : 3;
    return order(a) - order(b) || new Date(a.dueAt ?? '2999-01-01').getTime() - new Date(b.dueAt ?? '2999-01-01').getTime();
  });
  return <div className="content-stack">
    <div className="followup-summary-cards"><div className="followup-summary-item summary-overdue"><span><Clock3 size={16} /></span><small>Overdue</small><strong>{counts.Overdue}</strong><em>Needs a touch</em></div><div className="followup-summary-item summary-today"><span><CalendarCheck size={16} /></span><small>Due today</small><strong>{counts['Due today']}</strong><em>On your list</em></div><div className="followup-summary-item summary-upcoming"><span><Calendar size={16} /></span><small>Upcoming</small><strong>{counts.Upcoming}</strong><em>Next 7 days</em></div><div className="followup-summary-item summary-unscheduled"><span><AlertCircle size={16} /></span><small>Needs scheduling</small><strong>{unscheduledRelationships.length + counts.Unscheduled}</strong><em>Set a next date</em></div></div>
    <section className="panel followups-panel">
      <div className="followup-panel-toolbar"><div><h2>Follow-up queue</h2><p>Every task stays connected to its buyer and property.</p></div><div className="followup-toolbar-actions"><div className="segmented-control"><button className={teamView === 'My work' ? 'selected' : ''} onClick={() => setTeamView('My work')}>My work</button><button className={teamView === 'Everyone' ? 'selected' : ''} onClick={() => setTeamView('Everyone')}>Everyone</button></div><button className="button button-secondary button-small" onClick={onAdd}><Plus size={15} /> New follow-up</button></div></div>
      <div className="followup-tabs">{tabs.map((tab) => <button key={tab} className={filter === tab ? 'followup-tab active' : 'followup-tab'} onClick={() => setFilter(tab)}>{tab}<span>{counts[tab as keyof typeof counts]}</span></button>)}</div>
      {list.length ? <div className="followup-list">
        {list.map((task) => {
          const buyer = buyers.find((item) => item.id === task.buyerId);
          const property = properties.find((item) => item.id === task.propertyId);
          const status = getTaskBucket(task);
          const isComplete = task.status === 'Completed';
          return <div className={`followup-row ${isComplete ? 'followup-completed' : ''}`} key={task.id}>
            <button className={`task-checkbox ${isComplete ? 'checked' : ''} ${task.fromRelationship ? 'task-suggestion-checkbox' : ''}`} disabled={task.fromRelationship} onClick={() => !isComplete && !task.fromRelationship && onComplete(task.id)} aria-label={task.fromRelationship ? 'Schedule this suggested action' : isComplete ? 'Completed' : 'Mark task complete'}>{isComplete ? <Check size={13} /> : task.fromRelationship ? <Calendar size={10} /> : null}</button>
            <div className="followup-task-main"><div className="followup-task-title"><strong>{task.description}</strong>{task.priority === 'High' && <span className="priority-label">HIGH PRIORITY</span>}</div><div className="followup-task-meta"><button onClick={() => buyer && onBuyer(buyer.id, property?.id)}><Avatar name={buyer?.name ?? 'Buyer'} color={buyer?.color} size="tiny" />{buyer?.name ?? 'Buyer'}</button><span className="meta-divider">·</span>{property ? <button onClick={() => onProperty(property.id)}><MapPin size={12} />{property.address}</button> : <span><MapPin size={12} />No property linked</span>}</div></div>
            <div className="followup-assignee"><Avatar name={task.assignedTo} color={task.assignedTo === 'Sarah Miller' ? 'mint' : 'blue'} size="tiny" /><span>{task.assignedTo}</span></div>
            <div className="followup-due"><StatusBadge tone={status === 'Overdue' ? 'overdue' : status === 'Due today' ? 'due-today' : status === 'Completed' ? 'completed' : 'upcoming'}>{isComplete ? 'Completed' : task.dueAt ? (status === 'Overdue' ? `Overdue · ${formatDate(task.dueAt)}` : status === 'Due today' ? `Today · ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(task.dueAt))}` : formatDateTime(task.dueAt)) : 'Needs scheduling'}</StatusBadge></div>
            <div className="row-action-menu">{!isComplete && task.dueAt && buyer && <button className="icon-button quiet-icon" title="Draft a contextual follow-up" onClick={() => onMessage(buyer.id, property?.id)}><Sparkles size={15} /></button>}{!isComplete && <button className="icon-button quiet-icon" title="Schedule or reschedule this task" onClick={() => onSchedule(task)}><Calendar size={15} /></button>}{!isComplete && !task.fromRelationship && <button className="icon-button quiet-icon cancel-task-button" title="Cancel follow-up" onClick={() => onCancel(task.id)}><X size={14} /></button>}</div>
          </div>;
        })}
      </div> : <EmptyState icon={filter === 'Completed' ? CheckCheck : CalendarCheck} title={filter === 'Completed' ? 'No completed follow-ups yet' : `No ${filter.toLowerCase()} follow-ups`} description={filter === 'Unscheduled' ? 'Schedule an open next action so it does not get missed.' : 'Your queue is clear for this view. Keep building good follow-up habits.'} action={filter === 'Unscheduled' && unscheduledRelationships.length > 0 ? <button className="button button-secondary button-small" onClick={() => { const relationship = unscheduledRelationships[0]; onSchedule({ id: relationship.id, buyerId: relationship.buyerId, propertyId: relationship.propertyId, description: relationship.nextAction, assignedTo: 'Sarah Miller', priority: 'Normal', status: 'Open' }); }}>Schedule next action <ArrowRight size={14} /></button> : undefined} />}
      <div className="followup-footer"><span>Showing {list.length} {list.length === 1 ? 'task' : 'tasks'}{teamView === 'My work' ? ' assigned to you' : ' across your team'}</span><span><i className="small-dot small-dot-high" />High priority tasks are marked</span></div>
    </section>
  </div>;
}

function OffersPage({ data, onBuyer, onProperty, onAdd }: { data: WorkspaceData; onBuyer: (id: string, propertyId?: string) => void; onProperty: (id: string) => void; onAdd: () => void }) {
  const active = data.offers.filter((offer) => ['Draft', 'Submitted', 'Under Review', 'Countered'].includes(offer.status));
  const accepted = data.offers.filter((offer) => offer.status === 'Accepted');
  const totalActiveValue = active.reduce((sum, offer) => sum + offer.amount, 0);
  return <div className="content-stack">
    <div className="mini-stat-strip"><MiniStat label="Open offers" value={String(active.length)} accent="blue" /><MiniStat label="Submitted" value={String(data.offers.filter((offer) => offer.status === 'Submitted').length)} accent="amber" /><MiniStat label="Under negotiation" value={String(data.offers.filter((offer) => ['Under Review', 'Countered'].includes(offer.status)).length)} accent="violet" /><MiniStat label="Accepted" value={String(accepted.length)} accent="green" /></div>
    <section className="panel table-panel">
      <div className="table-toolbar"><div className="table-toolbar-title"><h2>Offer pipeline <span>{data.offers.length}</span></h2><p>{formatCurrency(totalActiveValue)} in active offer value · offers need human review.</p></div><div className="table-tools"><button className="button button-primary button-small" onClick={onAdd}><Plus size={15} /> Add offer</button></div></div>
      <div className="responsive-table"><table className="data-table offers-table"><thead><tr><th>Property</th><th>Buyer</th><th>Offer amount</th><th>Status</th><th>Offer date</th><th>Expiration</th><th>Next action</th><th /></tr></thead><tbody>
        {data.offers.map((offer) => {
          const property = data.properties.find((item) => item.id === offer.propertyId);
          const buyer = data.buyers.find((item) => item.id === offer.buyerId);
          return <tr key={offer.id}>
            <td><button className="text-cell-button" onClick={() => property && onProperty(property.id)}><strong>{property?.address ?? 'Property'}</strong><small>{property ? `${property.city}, ${property.state}` : ''}</small></button></td>
            <td><button className="buyer-cell table-buyer-button" onClick={() => buyer && onBuyer(buyer.id, property?.id)}><Avatar name={buyer?.name ?? 'Buyer'} color={buyer?.color} size="tiny" /><span>{buyer?.name ?? 'Buyer'}</span></button></td>
            <td className="amount-cell">{formatCurrency(offer.amount)}</td><td><StatusBadge>{offer.status}</StatusBadge></td><td className="muted-cell">{formatDate(offer.offerDate)}</td><td className="muted-cell">{formatDate(offer.expirationDate)}</td><td className="offer-next-action">{offer.nextAction}</td><td><button className="icon-button quiet-icon" title="View buyer" onClick={() => buyer && onBuyer(buyer.id, property?.id)}><ChevronRight size={16} /></button></td>
          </tr>;
        })}
      </tbody></table></div>
      {data.offers.length === 0 && <EmptyState icon={CircleDollarSign} title="No offers recorded" description="Add the first offer to start tracking negotiations." action={<button className="button button-primary button-small" onClick={onAdd}><Plus size={14} /> Add offer</button>} />}
      <div className="table-footer"><span><strong>{active.length}</strong> open · <strong>{accepted.length}</strong> accepted · <strong>{data.offers.filter((offer) => ['Rejected', 'Withdrawn', 'Expired'].includes(offer.status)).length}</strong> closed</span><button className="text-link" onClick={() => onAdd()}>Record an offer <ArrowRight size={14} /></button></div>
    </section>
    <div className="table-note"><span className="info-badge"><AlertCircle size={14} /></span><span>Amounts mentioned in call notes are not offers until a team member reviews and records them here.</span></div>
  </div>;
}

function ActivityPage({ events, buyers, properties, filter, setFilter, onBuyer, onProperty }: { events: TimelineEvent[]; buyers: Buyer[]; properties: Property[]; filter: string; setFilter: (value: string) => void; onBuyer: (id: string, propertyId?: string) => void; onProperty: (id: string) => void }) {
  const visibleEvents = events.filter((event) => filter === 'All activity' || (filter === 'Messages' ? event.kind.includes('SMS') || event.kind.includes('Email') : filter === 'Calls & voicemail' ? ['Phone Call', 'Voicemail'].includes(event.kind) : filter === 'Internal notes' ? event.kind === 'Internal Note' : event.kind.includes('Offer') || event.kind.includes('Status')));
  const sortedEvents = [...visibleEvents].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  const grouped = sortedEvents.reduce<Record<string, TimelineEvent[]>>((result, event) => {
    const groupLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(event.occurredAt));
    (result[groupLabel] ??= []).push(event);
    return result;
  }, {});
  return <div className="activity-layout">
    <section className="panel activity-panel">
      <div className="activity-toolbar"><div><h2>Communication timeline</h2><p>Events are shown by the time they happened, not when they were entered.</p></div><label className="select-shell"><ListFilter size={14} /><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All activity</option><option>Messages</option><option>Calls & voicemail</option><option>Internal notes</option><option>System events</option></select><ChevronDown size={13} /></label></div>
      {Object.keys(grouped).length ? <div className="timeline">
        {Object.entries(grouped).map(([day, dayEvents]) => <div className="timeline-day" key={day}><div className="timeline-day-label">{day}</div><div className="timeline-events">
          {dayEvents.map((event) => {
            const buyer = buyers.find((item) => item.id === event.buyerId);
            const property = properties.find((item) => item.id === event.propertyId);
            const Icon = event.kind.includes('SMS') || event.kind.includes('Email') ? MessageSquareText : event.kind === 'Phone Call' || event.kind === 'Voicemail' ? Phone : event.kind.includes('Offer') ? CircleDollarSign : event.kind === 'Follow-Up Completed' ? CheckCheck : event.kind === 'Status Changed' ? Activity : FileText;
            const tone = event.direction === 'Incoming' ? 'timeline-incoming' : event.direction === 'Outgoing' ? 'timeline-outgoing' : 'timeline-internal';
            return <article className="timeline-event" key={event.id}><div className={`timeline-event-icon ${tone}`}><Icon size={15} /></div><div className="timeline-event-content"><div className="timeline-event-heading"><strong>{event.kind}</strong><span>{formatDateTime(event.occurredAt)}</span><span className="direction-tag">{event.direction === 'Internal' ? 'Internal' : event.direction}</span></div><p>{event.content}</p>{event.enhancedNotes && <div className="enhanced-note"><Sparkles size={12} /><span>{event.enhancedNotes}</span></div>}<div className="timeline-event-footer"><span>Recorded {formatDateTime(event.recordedAt)} by {event.createdBy}</span><span className="timeline-links">{buyer && <button onClick={() => onBuyer(buyer.id, property?.id)}><Avatar name={buyer.name} color={buyer.color} size="tiny" />{buyer.name}</button>}{property && <button onClick={() => onProperty(property.id)}><MapPin size={11} />{property.address}</button>}</span></div></div></article>;
          })}
        </div></div>)}
      </div> : <EmptyState icon={Activity} title="No activity found" description="Try a different activity filter." />}
    </section>
    <aside className="activity-side-column"><section className="panel activity-key-panel"><h3>Reading the timeline</h3><p>Each record keeps the original message separate from internal notes and AI-assisted summaries.</p><div className="timeline-key"><span><i className="key-dot key-incoming" />Incoming from buyer</span><span><i className="key-dot key-outgoing" />Outgoing from team</span><span><i className="key-dot key-internal" />Internal or system event</span></div></section><section className="panel activity-audit-panel"><span className="audit-icon"><Clock3 size={17} /></span><strong>Occurred vs. recorded</strong><p>A backdated call stays in its true place in the timeline. The recorded timestamp is preserved for audit context.</p></section></aside>
  </div>;
}

function ReportsPage({ data, period, setPeriod }: { data: WorkspaceData; period: string; setPeriod: (period: string) => void }) {
  const completedTasks = data.tasks.filter((task) => task.status === 'Completed').length;
  const overdueTasks = data.tasks.filter((task) => task.status === 'Open' && getTaskBucket(task) === 'Overdue').length;
  const dueOpen = data.tasks.filter((task) => task.status === 'Open').length;
  const conversion = data.offers.length ? Math.round((data.offers.filter((offer) => offer.status === 'Accepted').length / data.offers.length) * 100) : 0;
  const propertyStages = ['Marketing', 'Offer Received', 'Under Contract', 'Pending', 'Sold'] as const;
  const maxStage = Math.max(1, ...propertyStages.map((stage) => data.properties.filter((property) => property.status === stage).length));
  const weekly = [
    { day: 'Mon', count: 5, done: 4 }, { day: 'Tue', count: 7, done: 5 }, { day: 'Wed', count: 6, done: 5 }, { day: 'Thu', count: 9, done: 7 }, { day: 'Fri', count: 8, done: completedTasks }, { day: 'Sat', count: 3, done: 2 }, { day: 'Sun', count: 2, done: 1 },
  ];
  const maxWeekly = Math.max(...weekly.map((item) => item.count), 1);
  return <div className="content-stack">
    <div className="reports-toolbar"><div className="report-period-note"><span className="report-period-icon"><Calendar size={15} /></span><span><strong>Performance overview</strong><small>Reporting period: {period} · Sample workspace data</small></span></div><label className="select-shell"><Calendar size={14} /><select value={period} onChange={(event) => setPeriod(event.target.value)}><option>Last 7 days</option><option>Last 30 days</option><option>This quarter</option></select><ChevronDown size={13} /></label></div>
    <div className="report-metrics-grid"><ReportMetric label="Tasks completed" value={String(completedTasks)} detail={`Current records · ${period}`} delta="Live count" tone="green" /><ReportMetric label="Open follow-ups" value={String(dueOpen)} detail={`${overdueTasks} currently overdue`} delta={overdueTasks ? `${overdueTasks} overdue` : 'On track'} tone={overdueTasks ? 'red' : 'blue'} /><ReportMetric label="Avg. response time" value="—" detail="Not enough timestamp pairs" delta="No data" tone="violet" /><ReportMetric label="Offer acceptance" value={`${conversion}%`} detail={`${data.offers.filter((offer) => offer.status === 'Accepted').length} of ${data.offers.length} offers accepted`} delta="Current records" tone="amber" /></div>
    <div className="reports-grid">
      <section className="panel chart-panel"><CardHeading title="Follow-up execution" subtitle="Tasks created vs. completed this week" action={<span className="chart-legend"><i className="legend-created" />Created <i className="legend-completed" />Completed</span>} /><div className="bar-chart"><div className="chart-y-labels"><span>10</span><span>7</span><span>4</span><span>0</span></div><div className="chart-plot"><div className="chart-grid-lines"><i /><i /><i /><i /></div><div className="chart-bars">{weekly.map((item) => <div className="chart-day" key={item.day}><div className="bar-stack"><span className="bar-created" style={{ height: `${(item.count / maxWeekly) * 100}%` }} /><span className="bar-completed" style={{ height: `${(item.done / maxWeekly) * 100}%` }} /></div><small>{item.day}</small></div>)}</div></div></div><div className="chart-footnote"><span><i className="chart-foot-dot" /> Completion rate</span><strong>{completedTasks + dueOpen ? Math.round(completedTasks / (completedTasks + dueOpen) * 100) : 0}%</strong><span>of logged follow-ups completed</span></div></section>
      <section className="panel stage-report-panel"><CardHeading title="Property pipeline" subtitle="Current status distribution" /><div className="stage-report-list">{propertyStages.map((stage) => { const count = data.properties.filter((property) => property.status === stage).length; return <div className="stage-report-row" key={stage}><div className="stage-report-label"><StatusBadge>{stage}</StatusBadge><strong>{count}</strong></div><div className="stage-report-track"><span style={{ width: `${(count / maxStage) * 100}%` }} /></div></div>; })}</div><div className="stage-report-footer"><span>Properties with active marketing</span><strong>{data.properties.filter((property) => ['Marketing', 'Offer Received'].includes(property.status)).length}</strong></div></section>
    </div>
    <div className="report-footnote"><AlertCircle size={14} /> Some visual trends use illustrative sample data in this prototype. Summary counts use the current workspace records.</div>
  </div>;
}

function ReportMetric({ label, value, detail, delta, tone }: { label: string; value: string; detail: string; delta: string; tone: string }) {
  return <div className="report-metric"><span>{label}</span><strong>{value}</strong><div className="report-metric-bottom"><small>{detail}</small><em className={`delta-${tone}`}>{tone === 'red' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{delta}</em></div></div>;
}

function SettingsPage({ tab, setTab, notificationPreference, setNotificationPreference, aiPreference, setAiPreference, onReset, showToast }: { tab: string; setTab: (value: string) => void; notificationPreference: boolean; setNotificationPreference: (value: boolean) => void; aiPreference: boolean; setAiPreference: (value: boolean) => void; onReset: () => void; showToast: (message: string) => void }) {
  const tabs = ['Workspace', 'Team', 'Workflow', 'AI & privacy'];
  return <div className="settings-layout"><nav className="settings-nav">{tabs.map((item) => <button key={item} className={tab === item ? 'settings-tab selected' : 'settings-tab'} onClick={() => setTab(item)}>{item === 'Workspace' ? <Building2 size={16} /> : item === 'Team' ? <Users size={16} /> : item === 'Workflow' ? <ListFilter size={16} /> : <Sparkles size={16} />}{item}<ChevronRight size={14} /></button>)}</nav><div className="settings-content">
    {tab === 'Workspace' && <section className="panel settings-panel"><div className="settings-panel-heading"><div><h2>Workspace profile</h2><p>Company details shown to your team.</p></div><button className="button button-secondary button-small" onClick={() => showToast('Workspace details saved')}>Save changes</button></div><div className="settings-form-grid"><label>Workspace name<input defaultValue="Waypoint Investments" /></label><label>Time zone<select defaultValue="Eastern Time (US & Canada)"><option>Eastern Time (US & Canada)</option><option>Central Time (US & Canada)</option><option>Mountain Time (US & Canada)</option><option>Pacific Time (US & Canada)</option></select></label><label>Primary market<input defaultValue="Cleveland, Ohio" /></label><label>Company size<select defaultValue="2–10 team members"><option>1 team member</option><option>2–10 team members</option><option>11–50 team members</option><option>51+ team members</option></select></label></div><div className="settings-section-separator" /><div className="settings-panel-heading"><div><h2>Workspace preferences</h2><p>Choose how your team receives in-app reminders.</p></div></div><SettingToggle title="Daily follow-up digest" description="Show a daily summary of overdue and upcoming tasks." checked={notificationPreference} onChange={setNotificationPreference} /></section>}
    {tab === 'Team' && <section className="panel settings-panel"><div className="settings-panel-heading"><div><h2>Team members</h2><p>Individual accounts make activity and ownership clear.</p></div><button className="button button-primary button-small" onClick={() => showToast('Invite flow will be connected to authentication.') }><Plus size={14} /> Invite member</button></div><div className="team-member-list"><div className="team-member-row"><Avatar name="Sarah Miller" color="mint" /><span><strong>Sarah Miller</strong><small>sarah@waypointinvestments.com</small></span><StatusBadge tone="active">Owner · Admin</StatusBadge><span className="team-member-last">You</span></div><div className="team-member-row"><Avatar name="Michael Reed" color="blue" /><span><strong>Michael Reed</strong><small>michael@waypointinvestments.com</small></span><StatusBadge tone="active">Team member</StatusBadge><span className="team-member-last">Active today</span></div></div><div className="settings-callout"><AlertCircle size={15} /><span>Authentication and invitations are not connected in this demo. Do not use this prototype to store real buyer data.</span></div></section>}
    {tab === 'Workflow' && <section className="panel settings-panel"><div className="settings-panel-heading"><div><h2>Workflow statuses</h2><p>Property and buyer interest are tracked independently.</p></div><button className="button button-secondary button-small" onClick={() => showToast('Workflow status settings saved')}>Save changes</button></div><div className="status-editor"><div><strong>Property statuses</strong><p>Update the stage of the deal itself.</p></div><div className="status-chip-list">{propertyStatuses.map((status) => <StatusBadge key={status}>{status}</StatusBadge>)}</div><button className="button button-plain button-small" onClick={() => showToast('Custom statuses are available in workspace configuration.') }><Plus size={14} /> Add status</button></div><div className="status-editor"><div><strong>Buyer interest statuses</strong><p>Track how each buyer feels about each property.</p></div><div className="status-chip-list">{interestStatuses.slice(0, 8).map((status) => <StatusBadge key={status}>{status}</StatusBadge>)}</div><button className="button button-plain button-small" onClick={() => showToast('Custom statuses are available in workspace configuration.') }><Plus size={14} /> Manage statuses</button></div></section>}
    {tab === 'AI & privacy' && <section className="panel settings-panel"><div className="settings-panel-heading"><div><h2>AI & data handling</h2><p>Human review stays in control of every AI-assisted suggestion.</p></div><span className="settings-preview-label">PREVIEW MODE</span></div><div className="ai-setting-box"><span className="ai-setting-icon"><Sparkles size={17} /></span><div><strong>AI notes & message drafts</strong><p>AI provider is not connected. Preview actions in this workspace use local demo examples only.</p></div><StatusBadge tone="neutral">Not connected</StatusBadge></div><SettingToggle title="Allow AI-assisted suggestions" description="Enable draft suggestions after an AI provider and data policy are configured." checked={aiPreference} onChange={(value) => { setAiPreference(value); if (value) showToast('Connect an AI provider before using live AI features.'); }} disabled /><div className="settings-section-separator" /><div className="privacy-note"><strong>Before connecting a provider</strong><p>Review retention and data processing terms, send only the context needed for a task, and never include personal contact details unless they are required.</p></div><button className="button button-danger-quiet button-small" onClick={onReset}>Reset demo workspace data</button></section>}
  </div></div>;
}

function SettingToggle({ title, description, checked, onChange, disabled = false }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <div className={`setting-toggle-row ${disabled ? 'toggle-disabled' : ''}`}><span><strong>{title}</strong><small>{description}</small></span><button className={`toggle-switch ${checked ? 'toggle-on' : ''}`} onClick={() => !disabled && onChange(!checked)} role="switch" aria-checked={checked} disabled={disabled}><i /></button></div>;
}

function PropertyDrawer({ property, data, countsByOffer, onClose, onBuyer, onAddBuyer, onInteraction, onTask, onOffer, onMessage, onStatus, onEdit, onHistory }: {
  property: Property; data: WorkspaceData; countsByOffer: Record<string, number>; onClose: () => void; onBuyer: (id: string, propertyId?: string) => void; onAddBuyer: () => void; onInteraction: () => void; onTask: () => void; onOffer: () => void; onMessage: (buyerId: string) => void; onStatus: (status: PropertyStatus) => void; onEdit: () => void; onHistory: () => void;
}) {
  const relations = data.relationships.filter((relationship) => relationship.propertyId === property.id);
  const propertyEvents = data.events.filter((event) => event.propertyId === property.id).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 4);
  const propertyOffers = data.offers.filter((offer) => offer.propertyId === property.id);
  const dueTask = data.tasks.filter((task) => task.propertyId === property.id && task.status === 'Open').sort((a, b) => new Date(a.dueAt ?? '2999').getTime() - new Date(b.dueAt ?? '2999').getTime())[0];
  return <>
    <div className="drawer-header"><div className="drawer-kicker">PROPERTY PROFILE <span>·</span> {property.zip}</div><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={18} /></button></div>
    <div className="drawer-scroll"><div className="drawer-title-block"><div className="drawer-property-icon"><Home size={20} /></div><div><h2>{property.address}</h2><p>{property.city}, {property.state} {property.zip}</p></div><button className="icon-button quiet-icon" onClick={() => navigator.clipboard?.writeText(getPropertyAddress(property)).then(() => {}).catch(() => {})} title="Copy address"><Copy size={15} /></button></div>
      <div className="drawer-status-line"><StatusBadge>{property.status}</StatusBadge><span>Updated {formatDateTime(property.updatedAt)}</span><label className="drawer-status-select"><select value={property.status} onChange={(event) => onStatus(event.target.value as PropertyStatus)} aria-label="Change property status">{propertyStatuses.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={12} /></label></div>
      <div className="drawer-action-row"><button className="button button-primary button-small" onClick={onInteraction}><MessageSquareText size={14} /> Log interaction</button><button className="button button-secondary button-small" onClick={onTask}><CalendarCheck size={14} /> Follow-up</button><button className="icon-button bordered-icon" onClick={onOffer} title="Add offer"><CircleDollarSign size={15} /></button></div>
      <div className="drawer-section"><div className="drawer-section-title"><h3>Deal snapshot</h3><button className="text-link" onClick={onEdit}>Edit <ArrowUpRight size={13} /></button></div><div className="deal-snapshot-grid"><div><small>Asking price</small><strong>{formatCurrency(property.askingPrice)}</strong></div><div><small>ARV</small><strong>{formatCurrency(property.arv)}</strong></div><div><small>Est. repairs</small><strong>{formatCurrency(property.repairs)}</strong></div><div><small>Assignment</small><strong>{property.assignmentPrice ? formatCurrency(property.assignmentPrice) : '—'}</strong></div></div><div className="drawer-detail-lines"><span><small>Expected closing</small><strong>{formatDate(property.expectedClose, { month: 'short', day: 'numeric', year: 'numeric' })}</strong></span><span><small>Next follow-up</small><strong>{dueTask?.dueAt ? formatDateTime(dueTask.dueAt) : 'Not scheduled'}</strong></span></div></div>
      <div className="drawer-section"><div className="drawer-section-title"><div><h3>Interested buyers</h3><small>{relations.length} linked to this property</small></div><button className="icon-button bordered-icon" onClick={onAddBuyer} title="Link buyer"><Plus size={15} /></button></div>
        {relations.length ? <div className="linked-buyer-list">{relations.map((relation) => { const buyer = data.buyers.find((item) => item.id === relation.buyerId); const relatedOffer = data.offers.find((offer) => offer.buyerId === relation.buyerId && offer.propertyId === property.id && ['Draft', 'Submitted', 'Under Review', 'Countered', 'Accepted'].includes(offer.status)); return <div className="linked-buyer-row" key={relation.id}><button className="linked-buyer-person" onClick={() => buyer && onBuyer(buyer.id, property.id)}><Avatar name={buyer?.name ?? 'Buyer'} color={buyer?.color} size="small" /><span><strong>{buyer?.name ?? 'Buyer'}</strong><small>{buyer?.company ?? 'Company'}</small></span></button><StatusBadge>{relation.interestStatus}</StatusBadge><div className="linked-buyer-meta"><span>{relatedOffer ? `${formatCurrency(relatedOffer.amount)} offer` : 'No offer recorded'}</span><span>{relation.nextFollowUpAt ? `Next · ${formatDate(relation.nextFollowUpAt)}` : relation.nextAction || 'No next action'}</span></div><button className="icon-button quiet-icon" title="Draft follow-up" disabled={buyer?.status === 'Do Not Contact'} onClick={() => buyer && onMessage(buyer.id)}><Sparkles size={15} /></button></div>; })}</div> : <EmptyState icon={Users} title="No buyers linked yet" description="Link a buyer to start a property-specific conversation." action={<button className="button button-secondary button-small" onClick={onAddBuyer}><Plus size={14} /> Link a buyer</button>} />}
      </div>
      <div className="drawer-section"><div className="drawer-section-title"><div><h3>Property notes</h3><small>Internal context, separate from buyer notes</small></div><button className="icon-button quiet-icon" onClick={onEdit} title="Edit property notes"><MoreHorizontal size={16} /></button></div><p className="drawer-notes">{property.notes || 'No property notes yet.'}</p></div>
      <div className="drawer-section"><div className="drawer-section-title"><div><h3>Recent activity</h3><small>{propertyOffers.length} offers · {countsByOffer[property.id] ?? 0} total</small></div><button className="text-link" onClick={onHistory}>View history <ArrowRight size={13} /></button></div>{propertyEvents.length ? <div className="drawer-mini-timeline">{propertyEvents.map((event) => <div className="drawer-mini-event" key={event.id}><i className={event.direction === 'Incoming' ? 'event-dot incoming' : event.direction === 'Outgoing' ? 'event-dot outgoing' : 'event-dot internal'} /><span><strong>{event.kind}</strong><small>{event.content}</small><em>{formatDateTime(event.occurredAt)}</em></span></div>)}</div> : <span className="subtle-copy">No activity recorded yet.</span>}</div>
    </div>
  </>;
}

function BuyerDrawer({ buyer, data, propertyId, onClose, onProperty, onInteraction, onTask, onOffer, onLinkProperty, onMessage, onEdit, onHistory }: {
  buyer: Buyer; data: WorkspaceData; propertyId?: string; onClose: () => void; onProperty: (id: string) => void; onInteraction: (propertyId?: string) => void; onTask: (propertyId?: string) => void; onOffer: (propertyId?: string) => void; onLinkProperty: () => void; onMessage: (propertyId?: string) => void; onEdit: () => void; onHistory: () => void;
}) {
  const relations = data.relationships.filter((relationship) => relationship.buyerId === buyer.id);
  const buyerEvents = data.events.filter((event) => event.buyerId === buyer.id && (!propertyId || event.propertyId === propertyId)).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 6);
  const buyerTasks = data.tasks.filter((task) => task.buyerId === buyer.id && task.status === 'Open').sort((a, b) => new Date(a.dueAt ?? '2999').getTime() - new Date(b.dueAt ?? '2999').getTime());
  const buyerOffers = data.offers.filter((offer) => offer.buyerId === buyer.id);
  const activeRelation = relations.find((relation) => relation.propertyId === propertyId) ?? relations[0];
  return <>
    <div className="drawer-header"><div className="drawer-kicker">BUYER PROFILE <span>·</span> {buyer.status.toUpperCase()}</div><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={18} /></button></div>
    <div className="drawer-scroll"><div className="buyer-drawer-intro"><Avatar name={buyer.name} color={buyer.color} size="large" /><div><h2>{buyer.name}</h2><p>{buyer.company}</p><StatusBadge>{buyer.status}</StatusBadge></div><button className="icon-button quiet-icon" onClick={onEdit} title="Edit buyer profile"><MoreHorizontal size={17} /></button></div>
      {buyer.status === 'Do Not Contact' && <div className="dnc-alert"><AlertCircle size={15} /><span>Do Not Contact is active. Follow-up message generation is disabled.</span></div>}
      <div className="drawer-action-row"><button className="button button-primary button-small" onClick={() => onInteraction(activeRelation?.propertyId)}><MessageSquareText size={14} /> Log interaction</button><button className="button button-secondary button-small" onClick={() => onTask(activeRelation?.propertyId)}><CalendarCheck size={14} /> Follow-up</button><button className="icon-button bordered-icon" onClick={() => onOffer(activeRelation?.propertyId)} title="Add offer"><CircleDollarSign size={15} /></button><button className="icon-button bordered-icon" onClick={() => onMessage(activeRelation?.propertyId)} title="Draft a follow-up" disabled={buyer.status === 'Do Not Contact'}><Sparkles size={15} /></button></div>
      <div className="buyer-contact-card"><a href={`tel:${buyer.phone}`}><Phone size={14} /><span>{buyer.phone}</span></a><a href={`mailto:${buyer.email}`}><Mail size={14} /><span>{buyer.email}</span></a><div><MessageSquareText size={14} /><span>Prefers {buyer.preferredContact.toLowerCase()}</span></div></div>
      <div className="drawer-section"><div className="drawer-section-title"><h3>Buying criteria</h3><button className="text-link" onClick={onEdit}>Edit <ArrowUpRight size={13} /></button></div><div className="criteria-box"><div><small>Preferred markets</small><span className="market-tags">{buyer.markets.map((market) => <i key={market}>{market}</i>)}</span></div><div><small>Property types</small><span className="market-tags">{buyer.propertyTypes.map((type) => <i key={type}>{type}</i>)}</span></div><div className="criteria-budget"><small>Budget range</small><strong>{formatCurrency(buyer.budgetMin)} – {formatCurrency(buyer.budgetMax)}</strong></div></div><p className="drawer-notes buyer-notes">{buyer.notes}</p></div>
      <div className="drawer-section"><div className="drawer-section-title"><div><h3>Interested properties</h3><small>{relations.length} linked · {buyerOffers.filter((offer) => ['Draft', 'Submitted', 'Under Review', 'Countered'].includes(offer.status)).length} open offers</small></div><button className="icon-button bordered-icon" onClick={onLinkProperty} title="Link property"><Plus size={15} /></button></div>
        {relations.length ? <div className="buyer-property-list">{relations.map((relation) => { const property = data.properties.find((item) => item.id === relation.propertyId); const offer = data.offers.find((item) => item.propertyId === relation.propertyId && item.buyerId === buyer.id && !['Rejected', 'Withdrawn', 'Expired'].includes(item.status)); return <button className={`buyer-property-row ${propertyId === relation.propertyId ? 'current' : ''}`} key={relation.id} onClick={() => property && onProperty(property.id)}><span className="buyer-property-main"><span className="property-symbol small-property-symbol"><Home size={14} /></span><span><strong>{property?.address ?? 'Property'}</strong><small>{property ? `${property.city}, ${property.state} · ${formatCurrency(property.askingPrice)}` : ''}</small></span></span><StatusBadge>{relation.interestStatus}</StatusBadge><span className="buyer-property-bottom"><small>{offer ? `${offer.status} · ${formatCurrency(offer.amount)}` : 'No active offer'}</small><small>{relation.nextFollowUpAt ? `Next follow-up ${formatDate(relation.nextFollowUpAt)}` : relation.nextAction || 'No follow-up scheduled'}</small></span><ChevronRight size={14} className="row-chevron" /></button>; })}</div> : <EmptyState icon={Home} title="No properties linked" description="Connect this buyer to a property to track specific interest and follow-up." action={<button className="button button-secondary button-small" onClick={onLinkProperty}><Plus size={14} /> Link property</button>} />}
      </div>
      <div className="drawer-section"><div className="drawer-section-title"><div><h3>Communication history</h3><small>Most recent first · original notes preserved</small></div><button className="text-link" onClick={onHistory}>Full history <ArrowRight size={13} /></button></div>{buyerEvents.length ? <div className="drawer-mini-timeline">{buyerEvents.map((event) => { const property = data.properties.find((item) => item.id === event.propertyId); return <div className="drawer-mini-event" key={event.id}><i className={event.direction === 'Incoming' ? 'event-dot incoming' : event.direction === 'Outgoing' ? 'event-dot outgoing' : 'event-dot internal'} /><span><strong>{event.kind}{property ? ` · ${property.address}` : ''}</strong><small>{event.content}</small><em>Occurred {formatDateTime(event.occurredAt)} · recorded {formatDateTime(event.recordedAt)}</em></span></div>; })}</div> : <span className="subtle-copy">No communication logged for this buyer.</span>}</div>
      {buyerTasks.length > 0 && <div className="drawer-section"><div className="drawer-section-title"><h3>Open follow-ups</h3><span className="drawer-count-pill">{buyerTasks.length}</span></div><div className="drawer-mini-timeline">{buyerTasks.map((task) => <div className="drawer-mini-event" key={task.id}><i className={`event-dot ${getTaskBucket(task) === 'Overdue' ? 'incoming' : 'outgoing'}`} /><span><strong>{task.description}</strong><small>{task.dueAt ? `${getTaskBucket(task)} · ${formatDateTime(task.dueAt)}` : 'Needs scheduling'} · {task.assignedTo}</small></span></div>)}</div></div>}
    </div>
  </>;
}

function ModalHost({ modal, data, close, onSaveProperty, onSaveBuyer, onSaveRelationship, onSaveTask, onSaveOffer, onSaveInteraction, showToast }: {
  modal: Exclude<ModalState, null>; data: WorkspaceData; close: () => void; onSaveProperty: (property: Omit<Property, 'id' | 'updatedAt'>, propertyId?: string) => void; onSaveBuyer: (buyer: Omit<Buyer, 'id' | 'color'>, buyerId?: string) => void; onSaveRelationship: (relationship: Omit<Relationship, 'id' | 'firstContactAt' | 'lastInteractionAt'>) => void; onSaveTask: (task: Omit<FollowUp, 'id' | 'status'>, taskId?: string) => void; onSaveOffer: (offer: Omit<Offer, 'id'>) => void; onSaveInteraction: (event: Omit<TimelineEvent, 'id' | 'recordedAt' | 'createdBy'>, taskInput?: Omit<FollowUp, 'id' | 'status'>) => void; showToast: (message: string) => void;
}) {
  const overlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) close(); };
  return <div className="modal-backdrop" onMouseDown={overlayMouseDown}>
    {modal.type === 'property' && <PropertyForm data={data} onClose={close} onSubmit={onSaveProperty} />}
    {modal.type === 'edit-property' && <PropertyForm data={data} initial={data.properties.find((property) => property.id === modal.id)} onClose={close} onSubmit={(property) => onSaveProperty(property, modal.id)} />}
    {modal.type === 'buyer' && <BuyerForm onClose={close} onSubmit={onSaveBuyer} />}
    {modal.type === 'edit-buyer' && <BuyerForm initial={data.buyers.find((buyer) => buyer.id === modal.id)} onClose={close} onSubmit={(buyer) => onSaveBuyer(buyer, modal.id)} />}
    {modal.type === 'relationship' && <RelationshipForm data={data} context={modal} onClose={close} onSubmit={onSaveRelationship} />}
    {modal.type === 'task' && <TaskForm data={data} context={modal} onClose={close} onSubmit={onSaveTask} />}
    {modal.type === 'offer' && <OfferForm data={data} context={modal} onClose={close} onSubmit={onSaveOffer} />}
    {modal.type === 'interaction' && <InteractionForm data={data} context={modal} onClose={close} onSubmit={onSaveInteraction} showToast={showToast} />}
    {modal.type === 'message' && <MessageDraftModal data={data} buyerId={modal.buyerId} propertyId={modal.propertyId} onClose={close} showToast={showToast} />}
    {modal.type === 'help' && <div className="modal-card small-modal"><ModalHeader eyebrow="SUPPORT" title="How can we help?" onClose={close} /><div className="help-modal-content"><span className="help-modal-icon"><HelpCircle size={20} /></span><p>This demo workspace is built around manual communication logging and human-reviewed follow-ups.</p><button className="button button-secondary full-button" onClick={() => { close(); showToast('Support resources are coming soon.'); }}>View getting started guide <ArrowRight size={14} /></button><span className="subtle-copy">Need product support? Your workspace admin can help.</span></div></div>}
  </div>;
}

function ModalHeader({ eyebrow, title, description, onClose }: { eyebrow?: string; title: string; description?: string; onClose: () => void }) {
  return <div className="modal-header"><div>{eyebrow && <span className="modal-eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>;
}

function FormField({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`form-field ${className}`}><span>{label}</span>{children}</label>;
}

function PropertyForm({ data, initial, onClose, onSubmit }: { data: WorkspaceData; initial?: Property; onClose: () => void; onSubmit: (property: Omit<Property, 'id' | 'updatedAt'>, propertyId?: string) => void }) {
  const [address, setAddress] = useState(initial?.address ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [state, setState] = useState(initial?.state ?? 'OH');
  const [zip, setZip] = useState(initial?.zip ?? '');
  const [status, setStatus] = useState<PropertyStatus>(initial?.status ?? 'Available');
  const [askingPrice, setAskingPrice] = useState(initial ? String(initial.askingPrice) : '');
  const [arv, setArv] = useState(initial ? String(initial.arv) : '');
  const [repairs, setRepairs] = useState(initial ? String(initial.repairs) : '');
  const [assignment, setAssignment] = useState(initial?.assignmentPrice ? String(initial.assignmentPrice) : '');
  const [expectedClose, setExpectedClose] = useState(initial?.expectedClose ? new Date(initial.expectedClose).toISOString().slice(0, 10) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [duplicate, setDuplicate] = useState('');
  const checkDuplicate = (value: string) => {
    setAddress(value);
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const match = data.properties.find((property) => property.id !== initial?.id && property.address.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized && normalized.length > 5);
    setDuplicate(match ? `${match.address}, ${match.city} already exists in this workspace.` : '');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!address.trim() || !city.trim() || !askingPrice) return;
    onSubmit({ address: address.trim(), city: city.trim(), state: state.toUpperCase().slice(0, 2), zip: zip.trim(), status, askingPrice: Number(askingPrice), arv: Number(arv || 0), repairs: Number(repairs || 0), assignmentPrice: assignment ? Number(assignment) : undefined, expectedClose: expectedClose ? new Date(`${expectedClose}T12:00:00`).toISOString() : undefined, notes: notes.trim() }, initial?.id);
  };
  return <div className="modal-card"><ModalHeader eyebrow="PROPERTY RECORD" title={initial ? 'Edit property' : 'Add a property'} description={initial ? 'Update the deal information for this property.' : 'Create a property record for your disposition pipeline.'} onClose={onClose} /><form onSubmit={submit}><div className="modal-form-body"><FormField label="Street address"><input autoFocus required placeholder="1842 W 44th St" value={address} onChange={(event) => checkDuplicate(event.target.value)} />{duplicate && <span className="field-warning"><AlertCircle size={13} />{duplicate}</span>}</FormField><div className="form-grid-three"><FormField label="City"><input required placeholder="Cleveland" value={city} onChange={(event) => setCity(event.target.value)} /></FormField><FormField label="State"><input required placeholder="OH" maxLength={2} value={state} onChange={(event) => setState(event.target.value)} /></FormField><FormField label="ZIP code"><input placeholder="44113" value={zip} onChange={(event) => setZip(event.target.value)} /></FormField></div><div className="form-grid-two"><FormField label="Property status"><select value={status} onChange={(event) => setStatus(event.target.value as PropertyStatus)}>{propertyStatuses.map((item) => <option key={item}>{item}</option>)}</select></FormField><FormField label="Asking price"><div className="input-prefix"><span>$</span><input required type="number" min="0" placeholder="142000" value={askingPrice} onChange={(event) => setAskingPrice(event.target.value)} /></div></FormField></div><div className="form-grid-three"><FormField label="ARV"><div className="input-prefix"><span>$</span><input type="number" min="0" placeholder="228000" value={arv} onChange={(event) => setArv(event.target.value)} /></div></FormField><FormField label="Est. repairs"><div className="input-prefix"><span>$</span><input type="number" min="0" placeholder="31000" value={repairs} onChange={(event) => setRepairs(event.target.value)} /></div></FormField><FormField label="Assignment price"><div className="input-prefix"><span>$</span><input type="number" min="0" placeholder="Optional" value={assignment} onChange={(event) => setAssignment(event.target.value)} /></div></FormField></div><FormField label="Expected closing date"><input type="date" value={expectedClose} onChange={(event) => setExpectedClose(event.target.value)} /></FormField><FormField label="Property notes"><textarea rows={3} placeholder="Access instructions, seller context, or deal notes..." value={notes} onChange={(event) => setNotes(event.target.value)} /></FormField><span className="form-footnote"><AlertCircle size={13} /> The address check is a prototype duplicate warning; confirm similar records before saving.</span></div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">{initial ? <Check size={15} /> : <Plus size={15} />}{initial ? 'Save changes' : 'Add property'}</button></div></form></div>;
}

function BuyerForm({ initial, onClose, onSubmit }: { initial?: Buyer; onClose: () => void; onSubmit: (buyer: Omit<Buyer, 'id' | 'color'>, buyerId?: string) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [company, setCompany] = useState(initial?.company ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [markets, setMarkets] = useState(initial?.markets.join(', ') ?? 'Cleveland');
  const [preferredContact, setPreferredContact] = useState<Buyer['preferredContact']>(initial?.preferredContact ?? 'Text');
  const [status, setStatus] = useState<BuyerStatus>(initial?.status ?? 'Active');
  const [budgetMin, setBudgetMin] = useState(initial?.budgetMin ? String(initial.budgetMin) : '');
  const [budgetMax, setBudgetMax] = useState(initial?.budgetMax ? String(initial.budgetMax) : '');
  const [propertyTypes, setPropertyTypes] = useState(initial?.propertyTypes.join(', ') ?? 'Single-family');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const submit = (event: FormEvent) => { event.preventDefault(); if (!name.trim()) return; onSubmit({ name: name.trim(), company: company.trim() || 'Independent buyer', phone: phone.trim(), email: email.trim(), markets: markets.split(',').map((item) => item.trim()).filter(Boolean), status, preferredContact, propertyTypes: propertyTypes.split(',').map((item) => item.trim()).filter(Boolean), budgetMin: Number(budgetMin || 0), budgetMax: Number(budgetMax || 0), notes: notes.trim() }, initial?.id); };
  return <div className="modal-card"><ModalHeader eyebrow="BUYER PROFILE" title={initial ? 'Edit buyer profile' : 'Add a buyer'} description={initial ? 'Update the buyer’s general profile and buying criteria.' : 'Create a central profile before linking them to a property.'} onClose={onClose} /><form onSubmit={submit}><div className="modal-form-body"><div className="form-grid-two"><FormField label="Full name"><input autoFocus required placeholder="Jordan Williams" value={name} onChange={(event) => setName(event.target.value)} /></FormField><FormField label="Company"><input placeholder="Company name" value={company} onChange={(event) => setCompany(event.target.value)} /></FormField></div><div className="form-grid-two"><FormField label="Phone number"><input placeholder="(216) 555-0100" value={phone} onChange={(event) => setPhone(event.target.value)} /></FormField><FormField label="Email address"><input type="email" placeholder="buyer@company.com" value={email} onChange={(event) => setEmail(event.target.value)} /></FormField></div><div className="form-grid-two"><FormField label="Preferred contact"><select value={preferredContact} onChange={(event) => setPreferredContact(event.target.value as Buyer['preferredContact'])}><option>Text</option><option>Email</option><option>Call</option></select></FormField><FormField label="Buyer status"><select value={status} onChange={(event) => setStatus(event.target.value as BuyerStatus)}>{buyerStatuses.map((item) => <option key={item}>{item}</option>)}</select></FormField></div><FormField label="Preferred markets"><input placeholder="Cleveland, Akron" value={markets} onChange={(event) => setMarkets(event.target.value)} /><small>Separate markets with commas.</small></FormField><div className="form-grid-two"><FormField label="Budget min"><div className="input-prefix"><span>$</span><input type="number" min="0" placeholder="75000" value={budgetMin} onChange={(event) => setBudgetMin(event.target.value)} /></div></FormField><FormField label="Budget max"><div className="input-prefix"><span>$</span><input type="number" min="0" placeholder="225000" value={budgetMax} onChange={(event) => setBudgetMax(event.target.value)} /></div></FormField></div><FormField label="Property types"><input placeholder="Single-family, Duplex" value={propertyTypes} onChange={(event) => setPropertyTypes(event.target.value)} /></FormField><FormField label="General buyer notes"><textarea rows={3} placeholder="Markets, buying preferences, or communication preferences..." value={notes} onChange={(event) => setNotes(event.target.value)} /></FormField></div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">{initial ? <Check size={15} /> : <Plus size={15} />}{initial ? 'Save changes' : 'Create buyer'}</button></div></form></div>;
}

function RelationshipForm({ data, context, onClose, onSubmit }: { data: WorkspaceData; context: { propertyId?: string; buyerId?: string }; onClose: () => void; onSubmit: (relationship: Omit<Relationship, 'id' | 'firstContactAt' | 'lastInteractionAt'>) => void }) {
  const [buyerId, setBuyerId] = useState(context.buyerId ?? data.buyers[0]?.id ?? '');
  const [propertyId, setPropertyId] = useState(context.propertyId ?? data.properties[0]?.id ?? '');
  const [interestStatus, setInterestStatus] = useState<InterestStatus>('New');
  const [nextAction, setNextAction] = useState('');
  const [interestNotes, setInterestNotes] = useState('');
  const duplicate = data.relationships.some((relationship) => relationship.buyerId === buyerId && relationship.propertyId === propertyId);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!buyerId || !propertyId || duplicate) return; onSubmit({ buyerId, propertyId, interestStatus, interestNotes, nextAction, nextFollowUpAt: undefined }); };
  return <div className="modal-card"><ModalHeader eyebrow="BUYER · PROPERTY LINK" title="Link a buyer to a property" description="Interest status belongs to this relationship, not the buyer profile." onClose={onClose} /><form onSubmit={submit}><div className="modal-form-body"><FormField label="Buyer"><select value={buyerId} onChange={(event) => setBuyerId(event.target.value)}>{data.buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name} · {buyer.company}</option>)}</select></FormField><FormField label="Property"><select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>{data.properties.map((property) => <option key={property.id} value={property.id}>{property.address} · {property.city}</option>)}</select></FormField><FormField label="Interest status"><select value={interestStatus} onChange={(event) => setInterestStatus(event.target.value as InterestStatus)}>{interestStatuses.map((status) => <option key={status}>{status}</option>)}</select></FormField><FormField label="Next action"><input placeholder="e.g. Send rent comps" value={nextAction} onChange={(event) => setNextAction(event.target.value)} /></FormField><FormField label="Relationship notes"><textarea rows={3} placeholder="What does this buyer think about this specific property?" value={interestNotes} onChange={(event) => setInterestNotes(event.target.value)} /></FormField>{duplicate && <span className="field-warning"><AlertCircle size={13} />This buyer is already linked to this property.</span>}</div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={duplicate || !buyerId || !propertyId}><Plus size={15} /> Link buyer</button></div></form></div>;
}

function TaskForm({ data, context, onClose, onSubmit }: { data: WorkspaceData; context: { buyerId?: string; propertyId?: string; taskId?: string; description?: string }; onClose: () => void; onSubmit: (task: Omit<FollowUp, 'id' | 'status'>, taskId?: string) => void }) {
  const existingTask = data.tasks.find((task) => task.id === context.taskId);
  const [buyerId, setBuyerId] = useState(context.buyerId ?? existingTask?.buyerId ?? data.buyers[0]?.id ?? '');
  const [propertyId, setPropertyId] = useState(context.propertyId ?? existingTask?.propertyId ?? '');
  const [description, setDescription] = useState(context.description ?? existingTask?.description ?? '');
  const [dueInput, setDueInput] = useState(toLocalDateTimeInput(existingTask?.dueAt ?? offsetDate(0, 15)));
  const [assignedTo, setAssignedTo] = useState(existingTask?.assignedTo ?? 'Sarah Miller');
  const [priority, setPriority] = useState<FollowUp['priority']>(existingTask?.priority ?? 'Normal');
  const [unscheduled, setUnscheduled] = useState(false);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!description.trim() || !buyerId) return; onSubmit({ buyerId, propertyId: propertyId || undefined, description: description.trim(), dueAt: unscheduled ? undefined : new Date(dueInput).toISOString(), assignedTo, priority }, context.taskId); };
  return <div className="modal-card"><ModalHeader eyebrow="FOLLOW-UP TASK" title={context.taskId ? 'Update a follow-up' : 'Schedule a follow-up'} description="Turn the next action into a clear task with an owner and due date." onClose={onClose} /><form onSubmit={submit}><div className="modal-form-body"><FormField label="Task description"><input autoFocus required placeholder="Confirm buyer's decision after partner review" value={description} onChange={(event) => setDescription(event.target.value)} /></FormField><div className="form-grid-two"><FormField label="Buyer"><select value={buyerId} onChange={(event) => setBuyerId(event.target.value)}>{data.buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}</option>)}</select></FormField><FormField label="Related property"><select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="">No property linked</option>{data.properties.map((property) => <option key={property.id} value={property.id}>{property.address}</option>)}</select></FormField></div><div className="form-grid-two"><FormField label="Due date & time"><input type="datetime-local" value={dueInput} disabled={unscheduled} onChange={(event) => setDueInput(event.target.value)} /></FormField><FormField label="Assigned to"><select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}><option>Sarah Miller</option><option>Michael Reed</option></select></FormField></div><FormField label="Priority"><select value={priority} onChange={(event) => setPriority(event.target.value as FollowUp['priority'])}><option>High</option><option>Normal</option><option>Low</option></select></FormField><label className="checkbox-line"><input type="checkbox" checked={unscheduled} onChange={(event) => setUnscheduled(event.target.checked)} /><span>Add to unscheduled queue instead</span></label></div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit"><CalendarCheck size={15} /> {context.taskId ? 'Save changes' : unscheduled ? 'Add to queue' : 'Schedule follow-up'}</button></div></form></div>;
}

function OfferForm({ data, context, onClose, onSubmit }: { data: WorkspaceData; context: { buyerId?: string; propertyId?: string }; onClose: () => void; onSubmit: (offer: Omit<Offer, 'id'>) => void }) {
  const [buyerId, setBuyerId] = useState(context.buyerId ?? data.buyers[0]?.id ?? '');
  const [propertyId, setPropertyId] = useState(context.propertyId ?? data.properties[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<OfferStatus>('Draft');
  const [offerDate, setOfferDate] = useState(toLocalDateTimeInput());
  const [terms, setTerms] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [notes, setNotes] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); if (!buyerId || !propertyId || !amount) return; onSubmit({ buyerId, propertyId, amount: Number(amount), status, offerDate: new Date(offerDate).toISOString(), terms, nextAction, notes }); };
  return <div className="modal-card"><ModalHeader eyebrow="OFFER RECORD" title="Add an offer" description="Only confirmed, human-reviewed offers belong in this record." onClose={onClose} /><form onSubmit={submit}><div className="modal-form-body"><div className="form-grid-two"><FormField label="Buyer"><select value={buyerId} onChange={(event) => setBuyerId(event.target.value)}>{data.buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}</option>)}</select></FormField><FormField label="Property"><select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>{data.properties.map((property) => <option key={property.id} value={property.id}>{property.address}</option>)}</select></FormField></div><div className="form-grid-two"><FormField label="Offer amount"><div className="input-prefix"><span>$</span><input autoFocus required type="number" min="1" placeholder="81000" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></FormField><FormField label="Offer status"><select value={status} onChange={(event) => setStatus(event.target.value as OfferStatus)}>{offerStatuses.map((item) => <option key={item}>{item}</option>)}</select></FormField></div><FormField label="Offer date"><input type="datetime-local" value={offerDate} onChange={(event) => setOfferDate(event.target.value)} /></FormField><FormField label="Terms"><input placeholder="Cash · 14-day close · inspection period" value={terms} onChange={(event) => setTerms(event.target.value)} /></FormField><FormField label="Next action"><input placeholder="Share seller response" value={nextAction} onChange={(event) => setNextAction(event.target.value)} /></FormField><FormField label="Negotiation notes"><textarea rows={3} placeholder="Conditions, counteroffer context, or internal notes..." value={notes} onChange={(event) => setNotes(event.target.value)} /></FormField></div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit"><CircleDollarSign size={15} /> Save offer</button></div></form></div>;
}

function InteractionForm({ data, context, onClose, onSubmit, showToast }: { data: WorkspaceData; context: { buyerId?: string; propertyId?: string }; onClose: () => void; onSubmit: (event: Omit<TimelineEvent, 'id' | 'recordedAt' | 'createdBy'>, task?: Omit<FollowUp, 'id' | 'status'>) => void; showToast: (message: string) => void }) {
  const [buyerId, setBuyerId] = useState(context.buyerId ?? data.buyers[0]?.id ?? '');
  const [propertyId, setPropertyId] = useState(context.propertyId ?? '');
  const [kind, setKind] = useState<EventKind>('Phone Call');
  const [direction, setDirection] = useState<TimelineEvent['direction']>('Incoming');
  const [occurredAt, setOccurredAt] = useState(toLocalDateTimeInput());
  const [content, setContent] = useState('');
  const [enhancedNotes, setEnhancedNotes] = useState('');
  const [outcome, setOutcome] = useState('');
  const [makeTask, setMakeTask] = useState(false);
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDue, setTaskDue] = useState(toLocalDateTimeInput(offsetDate(1, 10)));
  const [draftSaved, setDraftSaved] = useState(false);
  const interactionTypes: EventKind[] = ['Incoming SMS', 'Outgoing SMS', 'Incoming Email', 'Outgoing Email', 'Phone Call', 'Voicemail', 'Internal Note', 'Other Interaction'];
  const selectedBuyer = data.buyers.find((buyer) => buyer.id === buyerId);
  const enhance = () => {
    if (!content.trim()) { showToast('Add the original note before previewing an enhancement.'); return; }
    const clean = content.trim().replace(/\s+/g, ' ');
    const amount = clean.match(/\$\s?\d[\d,]*(?:\.\d{2})?/);
    const summary = clean.charAt(0).toUpperCase() + clean.slice(1).replace(/[.!?]*$/, '.');
    setEnhancedNotes(`${summary}${amount ? ` Potential amount mentioned: ${amount[0]} (unconfirmed).` : ''} ${outcome ? `Outcome noted: ${outcome}.` : 'Review and confirm the outcome before saving.'}`);
    setDraftSaved(true);
    showToast('Local AI preview added — review before saving');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!buyerId || !content.trim()) return;
    const internal = kind === 'Internal Note';
    const finalDirection = internal ? 'Internal' : direction;
    const task = makeTask && taskDescription.trim() ? { buyerId, propertyId: propertyId || undefined, description: taskDescription.trim(), dueAt: new Date(taskDue).toISOString(), assignedTo: 'Sarah Miller', priority: 'Normal' as const } : undefined;
    onSubmit({ buyerId, propertyId: propertyId || undefined, kind, direction: finalDirection, occurredAt: new Date(occurredAt).toISOString(), content: content.trim(), enhancedNotes: enhancedNotes.trim() || undefined, outcome: outcome.trim() || undefined }, task);
  };
  return <div className="modal-card interaction-modal"><ModalHeader eyebrow="ACTIVITY LOG" title="Log an interaction" description="Keep the original content and the time it actually happened." onClose={onClose} /><form onSubmit={submit}><div className="modal-form-body"><div className="form-grid-two"><FormField label="Buyer"><select value={buyerId} onChange={(event) => setBuyerId(event.target.value)}>{data.buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}</option>)}</select></FormField><FormField label="Property"><select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="">General buyer activity</option>{data.properties.map((property) => <option key={property.id} value={property.id}>{property.address}</option>)}</select></FormField></div>{selectedBuyer?.status === 'Do Not Contact' && <div className="dnc-alert compact-dnc"><AlertCircle size={14} /><span>This buyer is marked Do Not Contact. Log history only; do not draft outreach.</span></div>}<div className="form-grid-two"><FormField label="Activity type"><select value={kind} onChange={(event) => { setKind(event.target.value as EventKind); if (event.target.value === 'Internal Note') setDirection('Internal'); }}><optgroup label="Messages"><option>Incoming SMS</option><option>Outgoing SMS</option><option>Incoming Email</option><option>Outgoing Email</option></optgroup><optgroup label="Calls"><option>Phone Call</option><option>Voicemail</option></optgroup><optgroup label="Other"><option>Internal Note</option><option>Other Interaction</option></optgroup></select></FormField><FormField label="Direction"><select value={kind === 'Internal Note' ? 'Internal' : direction} disabled={kind === 'Internal Note'} onChange={(event) => setDirection(event.target.value as TimelineEvent['direction'])}><option>Incoming</option><option>Outgoing</option><option>Internal</option></select></FormField></div><FormField label="Occurred at"><input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /><small>Recorded at will be set to the current time when saved.</small></FormField><FormField label="Original content / call notes"><textarea required rows={4} placeholder="What did the buyer say? What did your team communicate?" value={content} onChange={(event) => { setContent(event.target.value); setDraftSaved(false); }} /><small>This original note is retained and never replaced by an AI summary.</small></FormField><div className="enhance-tools"><button type="button" className="button button-ai-outline button-small" onClick={enhance}><Sparkles size={14} /> Preview AI enhancement</button><span>Local demo preview · no provider connected</span></div>{enhancedNotes && <div className="enhanced-editor"><div><Sparkles size={13} /> Enhanced notes <span>{draftSaved ? 'Review before saving' : 'Edited'}</span></div><textarea rows={3} value={enhancedNotes} onChange={(event) => setEnhancedNotes(event.target.value)} /></div>}<FormField label="Interaction outcome"><input placeholder="Interested, requested photos, price concern..." value={outcome} onChange={(event) => setOutcome(event.target.value)} /></FormField><div className="make-task-box"><label className="checkbox-line"><input type="checkbox" checked={makeTask} onChange={(event) => setMakeTask(event.target.checked)} /><span>Create a follow-up from this interaction</span></label>{makeTask && <div className="form-grid-two task-inline-fields"><FormField label="Next action"><input required placeholder="Send requested photos" value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} /></FormField><FormField label="Due date & time"><input type="datetime-local" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} /></FormField></div>}</div></div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit"><Check size={15} /> Save interaction</button></div></form></div>;
}

function MessageDraftModal({ data, buyerId, propertyId, onClose, showToast }: { data: WorkspaceData; buyerId: string; propertyId?: string; onClose: () => void; showToast: (message: string) => void }) {
  const buyer = data.buyers.find((item) => item.id === buyerId);
  const relationship = data.relationships.find((item) => item.buyerId === buyerId && (!propertyId || item.propertyId === propertyId));
  const property = data.properties.find((item) => item.id === (propertyId ?? relationship?.propertyId));
  const relatedEvents = data.events.filter((event) => event.buyerId === buyerId && (!property?.id || event.propertyId === property.id)).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  const latestEvent = relatedEvents[0];
  const safeToDraft = buyer?.status !== 'Do Not Contact';
  const [draft, setDraft] = useState('');
  const [tone, setTone] = useState('Conversational');
  const buildDraft = (shorter = false, toneOverride = tone) => {
    if (!buyer || !safeToDraft) return '';
    const name = firstName(buyer.name);
    const address = property?.address;
    const ask = relationship?.interestStatus === 'Price Concern' ? `I wanted to check whether you've had a chance to review the numbers on ${address ?? 'the property'}.` : address ? `I wanted to check in on ${address} and see where things stand on your end.` : 'I wanted to check in and see where things stand on your end.';
    const askAbout = relationship?.nextAction ? ` ${relationship.nextAction.charAt(0).toLowerCase()}${relationship.nextAction.slice(1).replace(/[.!?]*$/, '')} when you have a moment.` : ' Let me know what you think when you have a chance.';
    const base = `Hey ${name}, ${ask}${askAbout}`;
    if (shorter) return `Hey ${name}, checking in on ${address ?? 'this opportunity'}. Any updates on your end?`;
    return toneOverride === 'Direct' ? `Hi ${name} — ${ask} Please let me know your next step.` : toneOverride === 'Warm' ? `Hey ${name}! Hope your week is going well. ${ask}${askAbout}` : base;
  };
  useEffect(() => { setDraft(buildDraft()); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const copyDraft = async () => {
    try { await navigator.clipboard.writeText(draft); showToast('Draft copied. Review it before sending.'); }
    catch { showToast('Clipboard access is unavailable in this preview.'); }
  };
  const rewrite = (action: string) => {
    if (action === 'shorter') setDraft(buildDraft(true));
    else if (action === 'direct') { setTone('Direct'); setDraft(`Hi ${buyer ? firstName(buyer.name) : 'there'} — ${property ? `checking in on ${property.address}. ` : ''}${relationship?.nextAction ?? 'Please let me know your next step.'}`); }
    else if (action === 'another') { setTone('Warm'); setDraft(buildDraft(false, 'Warm')); }
  };
  return <div className="modal-card message-modal"><ModalHeader eyebrow="AI FOLLOW-UP PREVIEW" title="Review your draft" description="Context from the selected buyer–property conversation." onClose={onClose} />
    {!safeToDraft ? <div className="dnc-modal-alert"><AlertCircle size={17} /><div><strong>Message draft unavailable</strong><p>This buyer is marked Do Not Contact. You can still review their history, but outreach drafts are disabled.</p></div></div> : <>
      <div className="message-context"><div className="message-context-buyer"><Avatar name={buyer?.name ?? 'Buyer'} color={buyer?.color} size="small" /><span><strong>{buyer?.name}</strong><small>{property ? property.address : 'General buyer follow-up'} · {relationship?.interestStatus ?? 'No linked status'}</small></span><StatusBadge tone="neutral">{buyer?.preferredContact ?? 'Text'}</StatusBadge></div><div className="context-source-list"><span><i />{latestEvent ? `${latestEvent.kind} · ${formatDateTime(latestEvent.occurredAt)}` : 'No recent activity found'}</span>{relationship?.interestNotes && <span><i />Interest note: {relationship.interestNotes}</span>}{relationship?.nextAction && <span><i />Next action: {relationship.nextAction}</span>}{!latestEvent && <span className="context-warning"><AlertCircle size={12} />No recent conversation was found. Verify context before use.</span>}</div></div>
      <div className="message-edit-heading"><span><Sparkles size={14} /> Suggested message</span><label className="select-shell"><span>Tone</span><select value={tone} onChange={(event) => { setTone(event.target.value); setDraft(buildDraft(false, event.target.value)); }}><option>Conversational</option><option>Warm</option><option>Direct</option></select><ChevronDown size={12} /></label></div>
      <textarea className="message-draft-input" rows={5} value={draft} onChange={(event) => setDraft(event.target.value)} />
      <div className="message-rewrite-tools"><button onClick={() => rewrite('shorter')}>Make it shorter</button><button onClick={() => rewrite('direct')}>More direct</button><button onClick={() => rewrite('another')}><Sparkles size={12} /> Another version</button></div>
      <div className="message-safety-note"><CheckCircle2 size={14} /><span>Draft only. Nothing is sent automatically. Confirm names, amounts, and details before use.</span></div>
    </>}
    <div className="modal-footer"><button className="button button-secondary" onClick={onClose}>Close</button>{safeToDraft && <button className="button button-primary" disabled={!draft.trim()} onClick={copyDraft}><Copy size={15} /> Copy draft</button>}</div>
  </div>;
}
