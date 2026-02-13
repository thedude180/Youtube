import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, CalendarDays, Shield, ChevronDown, ChevronUp, CheckCircle2, Building2, MapPin, AlertTriangle, DollarSign, FileCheck, ExternalLink, Globe, ArrowRight, CircleDot, Briefcase } from "lucide-react";
import { CollapsibleToolbox } from "@/components/CollapsibleToolbox";

type AIResponse = Record<string, unknown> | null;

const ENTITY_TYPES = ["sole_proprietor", "llc", "s_corp", "c_corp", "partnership"] as const;
const entityTypeLabels: Record<string, string> = { sole_proprietor: "Sole Proprietor", llc: "LLC", s_corp: "S-Corp", c_corp: "C-Corp", partnership: "Partnership" };
const FORMATION_STEPS = [
  { key: "entity", label: "Choose Entity Type", desc: "Select your business structure" },
  { key: "ein", label: "Get EIN", desc: "Apply for Employer Identification Number" },
  { key: "state", label: "State Registration", desc: "File with your state" },
  { key: "bank", label: "Business Bank Account", desc: "Open a dedicated account" },
  { key: "insurance", label: "Business Insurance", desc: "Get coverage for your business" },
  { key: "trademark", label: "Trademark", desc: "Protect your brand name" },
];

const COUNTRIES: { code: string; name: string; entityTypes: string[]; steps: { stepId: string; label: string; url: string }[] }[] = [
  {
    code: "US", name: "United States", entityTypes: ["Sole Proprietor", "LLC", "S-Corp", "C-Corp", "Partnership"],
    steps: [
      { stepId: "ein", label: "Apply for an EIN (Tax ID)", url: "https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online" },
      { stepId: "state", label: "Register with your State", url: "https://www.sba.gov/business-guide/launch-your-business/register-your-business" },
      { stepId: "llc", label: "Form an LLC (if applicable)", url: "https://www.sba.gov/business-guide/launch-your-business/choose-business-structure" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.nerdwallet.com/best/small-business/business-checking-accounts" },
    ],
  },
  {
    code: "GB", name: "United Kingdom", entityTypes: ["Sole Trader", "Limited Company (Ltd)", "Partnership", "LLP"],
    steps: [
      { stepId: "hmrc", label: "Register with HMRC", url: "https://www.gov.uk/register-for-self-assessment" },
      { stepId: "company", label: "Register a Company", url: "https://www.gov.uk/set-up-limited-company" },
      { stepId: "utr", label: "Get your UTR Number", url: "https://www.gov.uk/find-utr-number" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.starlingbank.com/business-account/" },
    ],
  },
  {
    code: "CA", name: "Canada", entityTypes: ["Sole Proprietorship", "Corporation", "Partnership", "Co-operative"],
    steps: [
      { stepId: "bn", label: "Get a Business Number (BN)", url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/registering-your-business/register.html" },
      { stepId: "register", label: "Register Your Business Name", url: "https://www.canada.ca/en/services/business/start/register-with-gov.html" },
      { stepId: "incorporate", label: "Incorporate (if applicable)", url: "https://ised-isde.canada.ca/site/corporations-canada/en/incorporating-federally" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.wealthsimple.com/en-ca/learn/best-business-bank-accounts-canada" },
    ],
  },
  {
    code: "AU", name: "Australia", entityTypes: ["Sole Trader", "Company (Pty Ltd)", "Partnership", "Trust"],
    steps: [
      { stepId: "abn", label: "Apply for an ABN", url: "https://www.abr.gov.au/business-super-funds-702charities/applying-abn" },
      { stepId: "register", label: "Register a Business Name", url: "https://www.asic.gov.au/for-business/registering-a-business-name/" },
      { stepId: "gst", label: "Register for GST", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.commbank.com.au/business/accounts.html" },
    ],
  },
  {
    code: "DE", name: "Germany", entityTypes: ["Einzelunternehmen (Sole Proprietor)", "GmbH", "UG (haftungsbeschrankt)", "GbR"],
    steps: [
      { stepId: "gewerbe", label: "Register at Gewerbeamt", url: "https://www.existenzgruender.de/EN/Die-ersten-Schritte/Anmeldungen-und-Genehmigungen/inhalt.html" },
      { stepId: "finanzamt", label: "Register with Finanzamt", url: "https://www.elster.de/eportal/start" },
      { stepId: "handelsregister", label: "Commercial Register (if GmbH)", url: "https://www.handelsregister.de/" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://n26.com/en-de/business" },
    ],
  },
  {
    code: "FR", name: "France", entityTypes: ["Auto-Entrepreneur", "SARL", "SAS", "EURL"],
    steps: [
      { stepId: "guichet", label: "Register at Guichet Unique", url: "https://formalites.entreprises.gouv.fr/" },
      { stepId: "siret", label: "Get your SIRET Number", url: "https://www.insee.fr/fr/information/2015441" },
      { stepId: "impots", label: "Register for Taxes", url: "https://www.impots.gouv.fr/professionnel" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.shine.fr/" },
    ],
  },
  {
    code: "JP", name: "Japan", entityTypes: ["Individual Business (Kojin Jigyo)", "KK (Kabushiki Kaisha)", "GK (Godo Kaisha)"],
    steps: [
      { stepId: "tax", label: "File Opening Notification", url: "https://www.nta.go.jp/english/" },
      { stepId: "register", label: "Register at Legal Affairs Bureau", url: "https://houmukyoku.moj.go.jp/homu/touki1.html" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.smbc.co.jp/kojin/english/" },
    ],
  },
  {
    code: "KR", name: "South Korea", entityTypes: ["Individual Business", "Corporation (Jusik Hoesa)"],
    steps: [
      { stepId: "register", label: "Register at CRIS", url: "https://www.startbiz.go.kr/" },
      { stepId: "tax", label: "Register for Business Tax", url: "https://www.nts.go.kr/english/main.do" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.shinhan.com/eng/index.jsp" },
    ],
  },
  {
    code: "BR", name: "Brazil", entityTypes: ["MEI", "EIRELI", "LTDA", "S/A"],
    steps: [
      { stepId: "mei", label: "Register as MEI", url: "https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/quero-ser-mei" },
      { stepId: "cnpj", label: "Get your CNPJ", url: "https://www.gov.br/receitafederal/pt-br" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.nubank.com.br/empresas/" },
    ],
  },
  {
    code: "IN", name: "India", entityTypes: ["Sole Proprietorship", "OPC", "LLP", "Private Limited"],
    steps: [
      { stepId: "register", label: "Register on MCA Portal", url: "https://www.mca.gov.in/content/mca/global/en/home.html" },
      { stepId: "pan", label: "Get Business PAN", url: "https://www.onlineservices.nsdl.com/paam/endUserRegisterContact.html" },
      { stepId: "gst", label: "Register for GST", url: "https://www.gst.gov.in/" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.razorpayx.com/current-account" },
    ],
  },
  {
    code: "MX", name: "Mexico", entityTypes: ["Persona Fisica", "S.A. de C.V.", "S. de R.L."],
    steps: [
      { stepId: "rfc", label: "Get your RFC", url: "https://www.sat.gob.mx/aplicacion/53027/genera-tu-constancia-de-situacion-fiscal" },
      { stepId: "sat", label: "Register with SAT", url: "https://www.sat.gob.mx/" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.bancomer.com/empresas.html" },
    ],
  },
  {
    code: "NL", name: "Netherlands", entityTypes: ["Eenmanszaak (Sole Proprietor)", "BV", "VOF"],
    steps: [
      { stepId: "kvk", label: "Register at KVK", url: "https://www.kvk.nl/english/registration/" },
      { stepId: "tax", label: "Register with Belastingdienst", url: "https://www.belastingdienst.nl/wps/wcm/connect/en/businesses/businesses" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.bunq.com/business" },
    ],
  },
  {
    code: "ES", name: "Spain", entityTypes: ["Autonomo", "Sociedad Limitada (S.L.)", "Sociedad Anonima (S.A.)"],
    steps: [
      { stepId: "nie", label: "Get NIE/NIF", url: "https://sede.administracionespublicas.gob.es/" },
      { stepId: "autonomo", label: "Register as Autonomo", url: "https://sede.seg-social.gob.es/" },
      { stepId: "hacienda", label: "Register with Hacienda", url: "https://sede.agenciatributaria.gob.es/" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.openbank.es/" },
    ],
  },
  {
    code: "IT", name: "Italy", entityTypes: ["Ditta Individuale", "S.r.l.", "S.p.A."],
    steps: [
      { stepId: "partita", label: "Get Partita IVA", url: "https://www.agenziaentrate.gov.it/portale/" },
      { stepId: "register", label: "Register at Camera di Commercio", url: "https://www.registroimprese.it/" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.qonto.com/it" },
    ],
  },
  {
    code: "PH", name: "Philippines", entityTypes: ["Sole Proprietorship", "Partnership", "Corporation"],
    steps: [
      { stepId: "dti", label: "Register with DTI", url: "https://bnrs.dti.gov.ph/" },
      { stepId: "bir", label: "Register with BIR", url: "https://www.bir.gov.ph/" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.bdo.com.ph/business" },
    ],
  },
  {
    code: "NG", name: "Nigeria", entityTypes: ["Enterprise (Sole Proprietor)", "Limited Company"],
    steps: [
      { stepId: "cac", label: "Register with CAC", url: "https://pre.cac.gov.ng/" },
      { stepId: "tin", label: "Get a TIN", url: "https://www.firs.gov.ng/" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.gtbank.com/" },
    ],
  },
  {
    code: "ZA", name: "South Africa", entityTypes: ["Sole Proprietor", "Pty Ltd", "Partnership"],
    steps: [
      { stepId: "cipc", label: "Register with CIPC", url: "https://www.cipc.co.za/" },
      { stepId: "sars", label: "Register with SARS", url: "https://www.sars.gov.za/" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://www.fnb.co.za/business-banking/index.html" },
    ],
  },
  {
    code: "OTHER", name: "Other Country", entityTypes: ["Sole Proprietor", "Limited Company", "Corporation", "Partnership"],
    steps: [
      { stepId: "local", label: "Register with Local Government", url: "https://www.doingbusiness.org/en/doingbusiness" },
      { stepId: "tax", label: "Register for Taxes", url: "https://www.oecd.org/tax/" },
      { stepId: "bank", label: "Open a Business Bank Account", url: "https://wise.com/us/business/" },
    ],
  },
];

function BusinessStructureSection() {
  const { toast } = useToast();
  const { data: bizDetails, isLoading: bizLoading } = useQuery<any>({ queryKey: ["/api/business-details"] });

  const [selectedCountry, setSelectedCountry] = useState("");
  const [hasBusiness, setHasBusiness] = useState<boolean | null>(null);
  const [formData, setFormData] = useState({
    businessName: "",
    entityType: "",
    registrationNumber: "",
    taxId: "",
    address: "",
    city: "",
    stateProvince: "",
    postalCode: "",
  });

  useEffect(() => {
    if (bizDetails) {
      setSelectedCountry(bizDetails.country || "");
      setHasBusiness(bizDetails.hasExistingBusiness ?? null);
      setFormData({
        businessName: bizDetails.businessName || "",
        entityType: bizDetails.entityType || "",
        registrationNumber: bizDetails.registrationNumber || "",
        taxId: bizDetails.taxId || "",
        address: bizDetails.address || "",
        city: bizDetails.city || "",
        stateProvince: bizDetails.stateProvince || "",
        postalCode: bizDetails.postalCode || "",
      });
    }
  }, [bizDetails]);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/business-details", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-details"] });
      toast({ title: "Business details saved" });
      setEditMode(false);
    },
    onError: (e: any) => toast({ title: "Error saving", description: e.message, variant: "destructive" }),
  });

  const stepsMutation = useMutation({
    mutationFn: async (steps: any[]) => {
      const res = await apiRequest("PUT", "/api/business-details/steps", { steps });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-details"] });
    },
    onError: (e: any) => toast({ title: "Error updating steps", description: e.message, variant: "destructive" }),
  });

  const [editMode, setEditMode] = useState(false);

  const countryData = COUNTRIES.find(c => c.code === selectedCountry);
  const registrationSteps: any[] = bizDetails?.registrationSteps || [];
  const allStepsComplete = registrationSteps.length > 0 && registrationSteps.every((s: any) => s.completed);
  const regStatus = bizDetails?.registrationStatus || "not_started";

  const handleSaveOwnBusiness = () => {
    if (!selectedCountry) return toast({ title: "Please select your country first", variant: "destructive" });
    saveMutation.mutate({
      hasExistingBusiness: true,
      country: selectedCountry,
      ...formData,
      registrationStatus: "complete",
    });
  };

  const handleStartRegistration = () => {
    if (!selectedCountry || !countryData) return;
    const steps = countryData.steps.map(s => ({
      stepId: s.stepId,
      label: s.label,
      url: s.url,
      completed: false,
    }));
    saveMutation.mutate({
      hasExistingBusiness: false,
      country: selectedCountry,
      registrationStatus: "in_progress",
      registrationSteps: steps,
    });
  };

  const handleVisitStep = (stepId: string, url: string) => {
    const updatedSteps = registrationSteps.map((s: any) =>
      s.stepId === stepId ? { ...s, visitedAt: s.visitedAt || new Date().toISOString() } : s
    );
    stepsMutation.mutate(updatedSteps);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleMarkComplete = (stepId: string) => {
    const step = registrationSteps.find((s: any) => s.stepId === stepId);
    if (!step?.visitedAt) {
      toast({ title: "Visit the link first", description: "You need to open and go through the registration link before marking it complete.", variant: "destructive" });
      return;
    }
    const updatedSteps = registrationSteps.map((s: any) =>
      s.stepId === stepId ? { ...s, completed: true, completedAt: new Date().toISOString() } : s
    );
    stepsMutation.mutate(updatedSteps);
    toast({ title: "Step marked complete" });
  };

  if (bizLoading) {
    return (
      <Card>
        <CardContent className="p-5">
          <Skeleton className="h-6 w-48 mb-4" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (!editMode && (regStatus === "complete" || (bizDetails?.hasExistingBusiness && bizDetails?.registrationStatus === "complete"))) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <h3 className="font-semibold text-sm" data-testid="text-biz-complete">Business Structure Complete</h3>
            <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate">Done</Badge>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            {bizDetails?.businessName && <p><span className="text-foreground font-medium">Business:</span> {bizDetails.businessName}</p>}
            {bizDetails?.entityType && <p><span className="text-foreground font-medium">Type:</span> {bizDetails.entityType}</p>}
            {bizDetails?.country && <p><span className="text-foreground font-medium">Country:</span> {COUNTRIES.find(c => c.code === bizDetails.country)?.name || bizDetails.country}</p>}
            {bizDetails?.registrationNumber && <p><span className="text-foreground font-medium">Reg #:</span> {bizDetails.registrationNumber}</p>}
            {bizDetails?.taxId && <p><span className="text-foreground font-medium">Tax ID:</span> {bizDetails.taxId}</p>}
            {!bizDetails?.hasExistingBusiness && (
              <p><span className="text-foreground font-medium">Registered via:</span> Guided registration steps</p>
            )}
          </div>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => {
              setEditMode(true);
              setHasBusiness(bizDetails?.hasExistingBusiness ? true : null);
            }}
            data-testid="button-edit-business"
          >
            Edit Details
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <Building2 className="w-6 h-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm mb-1" data-testid="text-business-setup-title">Set Up Your Business</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Making money from content means you're running a business. Set up the right structure to protect yourself, save on taxes, and look professional to sponsors.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block">Where are you located?</label>
            <Select value={selectedCountry} onValueChange={(v) => { setSelectedCountry(v); setHasBusiness(null); }}>
              <SelectTrigger data-testid="select-country">
                <SelectValue placeholder="Select your country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map(c => (
                  <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCountry && hasBusiness === null && (
            <div className="space-y-3">
              <p className="text-xs font-medium">Do you already have a registered business?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card className="cursor-pointer hover-elevate" onClick={() => setHasBusiness(true)} data-testid="card-has-business">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Briefcase className="w-5 h-5 text-primary shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Yes, I have a business</p>
                        <p className="text-xs text-muted-foreground">Enter your existing business details</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover-elevate" onClick={() => { setHasBusiness(false); handleStartRegistration(); }} data-testid="card-no-business">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-primary shrink-0" />
                      <div>
                        <p className="text-sm font-medium">No, help me register</p>
                        <p className="text-xs text-muted-foreground">We'll guide you through the steps</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {selectedCountry && hasBusiness === true && (
            <div className="space-y-3">
              <p className="text-xs font-medium flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-primary" />
                Enter Your Business Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">Business Name</label>
                  <Input
                    data-testid="input-biz-name"
                    placeholder="Your Business Name"
                    value={formData.businessName}
                    onChange={e => setFormData(p => ({ ...p, businessName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">Entity Type</label>
                  <Select value={formData.entityType} onValueChange={v => setFormData(p => ({ ...p, entityType: v }))}>
                    <SelectTrigger data-testid="select-entity-type">
                      <SelectValue placeholder="Select entity type" />
                    </SelectTrigger>
                    <SelectContent>
                      {(countryData?.entityTypes || []).map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">Registration Number</label>
                  <Input
                    data-testid="input-reg-number"
                    placeholder="Business registration number"
                    value={formData.registrationNumber}
                    onChange={e => setFormData(p => ({ ...p, registrationNumber: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">Tax ID</label>
                  <Input
                    data-testid="input-tax-id"
                    placeholder="EIN, VAT, ABN, etc."
                    value={formData.taxId}
                    onChange={e => setFormData(p => ({ ...p, taxId: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[11px] text-muted-foreground mb-1 block">Address</label>
                  <Input
                    data-testid="input-address"
                    placeholder="Street address"
                    value={formData.address}
                    onChange={e => setFormData(p => ({ ...p, address: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">City</label>
                  <Input
                    data-testid="input-city"
                    placeholder="City"
                    value={formData.city}
                    onChange={e => setFormData(p => ({ ...p, city: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">State / Province</label>
                  <Input
                    data-testid="input-state"
                    placeholder="State or Province"
                    value={formData.stateProvince}
                    onChange={e => setFormData(p => ({ ...p, stateProvince: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">Postal Code</label>
                  <Input
                    data-testid="input-postal"
                    placeholder="Postal / Zip code"
                    value={formData.postalCode}
                    onChange={e => setFormData(p => ({ ...p, postalCode: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Button onClick={handleSaveOwnBusiness} disabled={!formData.businessName || saveMutation.isPending} data-testid="button-save-business">
                  {saveMutation.isPending ? "Saving..." : "Save Business Details"}
                </Button>
                <Button variant="outline" onClick={() => { setHasBusiness(null); if (bizDetails) setEditMode(false); }} data-testid="button-cancel-business">
                  Back
                </Button>
              </div>
            </div>
          )}

          {selectedCountry && hasBusiness === false && registrationSteps.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Globe className="w-4 h-4 text-primary" />
                <p className="text-xs font-medium">
                  Registration Steps for {countryData?.name || selectedCountry}
                </p>
                {allStepsComplete ? (
                  <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate">All Complete</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    {registrationSteps.filter((s: any) => s.completed).length} / {registrationSteps.length} done
                  </Badge>
                )}
              </div>

              <div className="space-y-2">
                {registrationSteps.map((step: any, idx: number) => (
                  <Card
                    key={step.stepId}
                    className={step.completed ? "border-emerald-500/20" : ""}
                    data-testid={`card-reg-step-${step.stepId}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          step.completed
                            ? "border-emerald-500 bg-emerald-500"
                            : step.visitedAt
                              ? "border-amber-500 bg-amber-500/20"
                              : "border-muted-foreground/30"
                        }`}>
                          {step.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-white" />
                          ) : (
                            <span className="text-[10px] font-bold text-muted-foreground">{idx + 1}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${step.completed ? "line-through text-muted-foreground" : ""}`}>
                            {step.label}
                          </p>
                          {step.visitedAt && !step.completed && (
                            <p className="text-[10px] text-amber-500">Visited - complete registration then mark done</p>
                          )}
                          {step.completedAt && (
                            <p className="text-[10px] text-emerald-500">Completed {new Date(step.completedAt).toLocaleDateString()}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {!step.completed && (
                            <>
                              <Button
                                variant="outline"
                                onClick={() => handleVisitStep(step.stepId, step.url)}
                                data-testid={`button-visit-${step.stepId}`}
                              >
                                <ExternalLink className="w-3 h-3 mr-1.5" />
                                {step.visitedAt ? "Visit Again" : "Open Link"}
                              </Button>
                              <Button
                                variant={step.visitedAt ? "default" : "outline"}
                                onClick={() => handleMarkComplete(step.stepId)}
                                disabled={!step.visitedAt}
                                data-testid={`button-complete-${step.stepId}`}
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1.5" />
                                Mark Done
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Button variant="outline" onClick={() => { setHasBusiness(null); if (bizDetails) setEditMode(false); }} data-testid="button-back-choice">
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LegalTab() {
  const { toast } = useToast();
  const { data: ventures } = useQuery<any[]>({ queryKey: ['/api/ventures'] });
  const { data: taxEstimates } = useQuery<any[]>({ queryKey: ['/api/tax-estimates'] });

  const [completedSteps, setCompletedSteps] = useState<string[]>(() => {
    const stored = localStorage.getItem("legalFormationSteps");
    return stored ? JSON.parse(stored) : [];
  });

  const toggleStep = (key: string) => {
    setCompletedSteps((prev: string[]) => {
      const next = prev.includes(key) ? prev.filter((k: string) => k !== key) : [...prev, key];
      localStorage.setItem("legalFormationSteps", JSON.stringify(next));
      return next;
    });
  };

  const completionPct = Math.round((completedSteps.length / FORMATION_STEPS.length) * 100);

  const activeVenture = ventures?.find((v: any) => v.status === "active");
  const entityType = activeVenture?.metadata?.entityType || activeVenture?.type || null;

  const upcomingTax = taxEstimates?.find((t: any) => !t.paid && t.dueDate && new Date(t.dueDate) > new Date());

  const [location, setLocation] = useState(() => localStorage.getItem("creatorLocation") || "");
  const [locationInput, setLocationInput] = useState(() => localStorage.getItem("creatorLocation") || "");
  const [aiStructure, setAiStructure] = useState<AIResponse>(null);
  const [aiStructureLoading, setAiStructureLoading] = useState(false);

  const fetchStructureAdvice = (loc: string) => {
    if (!loc.trim()) return;
    localStorage.setItem("creatorLocation", loc.trim());
    setLocation(loc.trim());
    const cacheKey = `ai_structure_${loc.trim().toLowerCase()}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const e = JSON.parse(cached);
        if (e.ts && Date.now() - e.ts < 1800000) { setAiStructure(e.data); return; }
        else { sessionStorage.removeItem(cacheKey); }
      } catch {}
    }
    setAiStructureLoading(true);
    setAiStructure(null);
    apiRequest("POST", "/api/ai/business-entity", { location: loc.trim(), platform: "gaming content creator", revenue: "growing" })
      .then(r => r.json())
      .then(d => {
        setAiStructure(d);
        sessionStorage.setItem(cacheKey, JSON.stringify({ data: d, ts: Date.now() }));
      })
      .catch(() => {})
      .finally(() => setAiStructureLoading(false));
  };

  useEffect(() => {
    if (location) fetchStructureAdvice(location);
  }, []);

  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const [showLegalAI, setShowLegalAI] = useState(false);
  const [aiCopyright, setAiCopyright] = useState<AIResponse>(null);
  const [aiCopyrightLoading, setAiCopyrightLoading] = useState(false);
  const [aiFairUse, setAiFairUse] = useState<AIResponse>(null);
  const [aiFairUseLoading, setAiFairUseLoading] = useState(false);
  const [aiMusicLicense, setAiMusicLicense] = useState<AIResponse>(null);
  const [aiMusicLicenseLoading, setAiMusicLicenseLoading] = useState(false);
  const [aiPrivacyPolicy, setAiPrivacyPolicy] = useState<AIResponse>(null);
  const [aiPrivacyPolicyLoading, setAiPrivacyPolicyLoading] = useState(false);
  const [aiToS, setAiToS] = useState<AIResponse>(null);
  const [aiToSLoading, setAiToSLoading] = useState(false);
  const [aiFTC, setAiFTC] = useState<AIResponse>(null);
  const [aiFTCLoading, setAiFTCLoading] = useState(false);
  const [aiCOPPA, setAiCOPPA] = useState<AIResponse>(null);
  const [aiCOPPALoading, setAiCOPPALoading] = useState(false);
  const [aiGDPR, setAiGDPR] = useState<AIResponse>(null);
  const [aiGDPRLoading, setAiGDPRLoading] = useState(false);
  const [aiContentID, setAiContentID] = useState<AIResponse>(null);
  const [aiContentIDLoading, setAiContentIDLoading] = useState(false);
  const [aiDispute, setAiDispute] = useState<AIResponse>(null);
  const [aiDisputeLoading, setAiDisputeLoading] = useState(false);
  const [aiTrademark, setAiTrademark] = useState<AIResponse>(null);
  const [aiTrademarkLoading, setAiTrademarkLoading] = useState(false);
  const [aiContractTempl, setAiContractTempl] = useState<AIResponse>(null);
  const [aiContractTemplLoading, setAiContractTemplLoading] = useState(false);
  const [aiInsurance, setAiInsurance] = useState<AIResponse>(null);
  const [aiInsuranceLoading, setAiInsuranceLoading] = useState(false);
  const [aiBizEntity, setAiBizEntity] = useState<AIResponse>(null);
  const [aiBizEntityLoading, setAiBizEntityLoading] = useState(false);
  const [aiIPProtect, setAiIPProtect] = useState<AIResponse>(null);
  const [aiIPProtectLoading, setAiIPProtectLoading] = useState(false);

  const [showSensitivityAI, setShowSensitivityAI] = useState(false);
  const [aiDiversityCS, setAiDiversityCS] = useState<AIResponse>(null);
  const [aiDiversityCSLoading, setAiDiversityCSLoading] = useState(false);
  const [aiMHContent, setAiMHContent] = useState<AIResponse>(null);
  const [aiMHContentLoading, setAiMHContentLoading] = useState(false);
  const [aiPolitical, setAiPolitical] = useState<AIResponse>(null);
  const [aiPoliticalLoading, setAiPoliticalLoading] = useState(false);
  const [aiReligious, setAiReligious] = useState<AIResponse>(null);
  const [aiReligiousLoading, setAiReligiousLoading] = useState(false);
  const [aiCulturalCS, setAiCulturalCS] = useState<AIResponse>(null);
  const [aiCulturalCSLoading, setAiCulturalCSLoading] = useState(false);
  const [aiBodyImage, setAiBodyImage] = useState<AIResponse>(null);
  const [aiBodyImageLoading, setAiBodyImageLoading] = useState(false);
  const [aiAddiction, setAiAddiction] = useState<AIResponse>(null);
  const [aiAddictionLoading, setAiAddictionLoading] = useState(false);
  const [aiFinDisclaim, setAiFinDisclaim] = useState<AIResponse>(null);
  const [aiFinDisclaimLoading, setAiFinDisclaimLoading] = useState(false);

  const [showLegalProtAI, setShowLegalProtAI] = useState(false);
  const [aiCopyrightShield, setAiCopyrightShield] = useState<AIResponse>(null);
  const [aiCopyrightShieldLoading, setAiCopyrightShieldLoading] = useState(false);
  const [aiContractAnalyzer, setAiContractAnalyzer] = useState<AIResponse>(null);
  const [aiContractAnalyzerLoading, setAiContractAnalyzerLoading] = useState(false);
  const [aiFairUseAnalyzer, setAiFairUseAnalyzer] = useState<AIResponse>(null);
  const [aiFairUseAnalyzerLoading, setAiFairUseAnalyzerLoading] = useState(false);
  const [aiDMCADefense, setAiDMCADefense] = useState<AIResponse>(null);
  const [aiDMCADefenseLoading, setAiDMCADefenseLoading] = useState(false);
  const [aiContentInsAdvisor, setAiContentInsAdvisor] = useState<AIResponse>(null);
  const [aiContentInsAdvisorLoading, setAiContentInsAdvisorLoading] = useState(false);

  useEffect(() => {
    if (!showLegalAI) return;
    const cached = sessionStorage.getItem("ai_copyright");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCopyright(e.data); return; } else { sessionStorage.removeItem("ai_copyright"); } } catch {} }
    setAiCopyrightLoading(true);
    apiRequest("POST", "/api/ai/copyright-check", {}).then(r => r.json()).then(d => { setAiCopyright(d); sessionStorage.setItem("ai_copyright", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCopyrightLoading(false));
  }, [showLegalAI]);
  useEffect(() => {
    if (!showLegalAI) return;
    const cached = sessionStorage.getItem("ai_fair_use");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiFairUse(e.data); return; } else { sessionStorage.removeItem("ai_fair_use"); } } catch {} }
    setAiFairUseLoading(true);
    apiRequest("POST", "/api/ai/fair-use", {}).then(r => r.json()).then(d => { setAiFairUse(d); sessionStorage.setItem("ai_fair_use", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiFairUseLoading(false));
  }, [showLegalAI]);
  useEffect(() => {
    if (!showLegalAI) return;
    const cached = sessionStorage.getItem("ai_music_license");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMusicLicense(e.data); return; } else { sessionStorage.removeItem("ai_music_license"); } } catch {} }
    setAiMusicLicenseLoading(true);
    apiRequest("POST", "/api/ai/music-license", {}).then(r => r.json()).then(d => { setAiMusicLicense(d); sessionStorage.setItem("ai_music_license", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiMusicLicenseLoading(false));
  }, [showLegalAI]);
  useEffect(() => {
    if (!showLegalAI) return;
    const cached = sessionStorage.getItem("ai_privacy_policy");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPrivacyPolicy(e.data); return; } else { sessionStorage.removeItem("ai_privacy_policy"); } } catch {} }
    setAiPrivacyPolicyLoading(true);
    apiRequest("POST", "/api/ai/privacy-policy", {}).then(r => r.json()).then(d => { setAiPrivacyPolicy(d); sessionStorage.setItem("ai_privacy_policy", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiPrivacyPolicyLoading(false));
  }, [showLegalAI]);
  useEffect(() => {
    if (!showLegalAI) return;
    const cached = sessionStorage.getItem("ai_tos");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiToS(e.data); return; } else { sessionStorage.removeItem("ai_tos"); } } catch {} }
    setAiToSLoading(true);
    apiRequest("POST", "/api/ai/terms-of-service", {}).then(r => r.json()).then(d => { setAiToS(d); sessionStorage.setItem("ai_tos", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiToSLoading(false));
  }, [showLegalAI]);
  useEffect(() => {
    if (!showLegalAI) return;
    const cached = sessionStorage.getItem("ai_ftc");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiFTC(e.data); return; } else { sessionStorage.removeItem("ai_ftc"); } } catch {} }
    setAiFTCLoading(true);
    apiRequest("POST", "/api/ai/ftc-compliance", {}).then(r => r.json()).then(d => { setAiFTC(d); sessionStorage.setItem("ai_ftc", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiFTCLoading(false));
  }, [showLegalAI]);
  useEffect(() => {
    if (!showLegalAI) return;
    const cached = sessionStorage.getItem("ai_coppa");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCOPPA(e.data); return; } else { sessionStorage.removeItem("ai_coppa"); } } catch {} }
    setAiCOPPALoading(true);
    apiRequest("POST", "/api/ai/coppa", {}).then(r => r.json()).then(d => { setAiCOPPA(d); sessionStorage.setItem("ai_coppa", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCOPPALoading(false));
  }, [showLegalAI]);
  useEffect(() => {
    if (!showLegalAI) return;
    const cached = sessionStorage.getItem("ai_gdpr");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiGDPR(e.data); return; } else { sessionStorage.removeItem("ai_gdpr"); } } catch {} }
    setAiGDPRLoading(true);
    apiRequest("POST", "/api/ai/gdpr", {}).then(r => r.json()).then(d => { setAiGDPR(d); sessionStorage.setItem("ai_gdpr", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiGDPRLoading(false));
  }, [showLegalAI]);
  useEffect(() => {
    if (!showLegalAI) return;
    const cached = sessionStorage.getItem("ai_content_id");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiContentID(e.data); return; } else { sessionStorage.removeItem("ai_content_id"); } } catch {} }
    setAiContentIDLoading(true);
    apiRequest("POST", "/api/ai/content-id", {}).then(r => r.json()).then(d => { setAiContentID(d); sessionStorage.setItem("ai_content_id", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiContentIDLoading(false));
  }, [showLegalAI]);
  useEffect(() => {
    if (!showLegalAI) return;
    const cached = sessionStorage.getItem("ai_dispute");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDispute(e.data); return; } else { sessionStorage.removeItem("ai_dispute"); } } catch {} }
    setAiDisputeLoading(true);
    apiRequest("POST", "/api/ai/dispute-resolution", {}).then(r => r.json()).then(d => { setAiDispute(d); sessionStorage.setItem("ai_dispute", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiDisputeLoading(false));
  }, [showLegalAI]);
  useEffect(() => {
    if (!showLegalAI) return;
    const cached = sessionStorage.getItem("ai_trademark");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTrademark(e.data); return; } else { sessionStorage.removeItem("ai_trademark"); } } catch {} }
    setAiTrademarkLoading(true);
    apiRequest("POST", "/api/ai/trademark", {}).then(r => r.json()).then(d => { setAiTrademark(d); sessionStorage.setItem("ai_trademark", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiTrademarkLoading(false));
  }, [showLegalAI]);
  useEffect(() => {
    if (!showLegalAI) return;
    const cached = sessionStorage.getItem("ai_contract_templ");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiContractTempl(e.data); return; } else { sessionStorage.removeItem("ai_contract_templ"); } } catch {} }
    setAiContractTemplLoading(true);
    apiRequest("POST", "/api/ai/contract-template", {}).then(r => r.json()).then(d => { setAiContractTempl(d); sessionStorage.setItem("ai_contract_templ", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiContractTemplLoading(false));
  }, [showLegalAI]);
  useEffect(() => {
    if (!showLegalAI) return;
    const cached = sessionStorage.getItem("ai_insurance");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiInsurance(e.data); return; } else { sessionStorage.removeItem("ai_insurance"); } } catch {} }
    setAiInsuranceLoading(true);
    apiRequest("POST", "/api/ai/insurance", {}).then(r => r.json()).then(d => { setAiInsurance(d); sessionStorage.setItem("ai_insurance", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiInsuranceLoading(false));
  }, [showLegalAI]);
  useEffect(() => {
    if (!showLegalAI) return;
    const cached = sessionStorage.getItem("ai_biz_entity");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBizEntity(e.data); return; } else { sessionStorage.removeItem("ai_biz_entity"); } } catch {} }
    setAiBizEntityLoading(true);
    apiRequest("POST", "/api/ai/business-entity", {}).then(r => r.json()).then(d => { setAiBizEntity(d); sessionStorage.setItem("ai_biz_entity", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiBizEntityLoading(false));
  }, [showLegalAI]);
  useEffect(() => {
    if (!showLegalAI) return;
    const cached = sessionStorage.getItem("ai_ip_protect");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiIPProtect(e.data); return; } else { sessionStorage.removeItem("ai_ip_protect"); } } catch {} }
    setAiIPProtectLoading(true);
    apiRequest("POST", "/api/ai/ip-protection", {}).then(r => r.json()).then(d => { setAiIPProtect(d); sessionStorage.setItem("ai_ip_protect", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiIPProtectLoading(false));
  }, [showLegalAI]);

  useEffect(() => {
    if (!showSensitivityAI) return;
    const cached = sessionStorage.getItem("ai_diversity");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDiversityCS(e.data); return; } else { sessionStorage.removeItem("ai_diversity"); } } catch {} }
    setAiDiversityCSLoading(true);
    apiRequest("POST", "/api/ai/diversity", {}).then(r => r.json()).then(d => { setAiDiversityCS(d); sessionStorage.setItem("ai_diversity", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiDiversityCSLoading(false));
  }, [showSensitivityAI]);
  useEffect(() => {
    if (!showSensitivityAI) return;
    const cached = sessionStorage.getItem("ai_mh_content");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMHContent(e.data); return; } else { sessionStorage.removeItem("ai_mh_content"); } } catch {} }
    setAiMHContentLoading(true);
    apiRequest("POST", "/api/ai/mental-health-content", {}).then(r => r.json()).then(d => { setAiMHContent(d); sessionStorage.setItem("ai_mh_content", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiMHContentLoading(false));
  }, [showSensitivityAI]);
  useEffect(() => {
    if (!showSensitivityAI) return;
    const cached = sessionStorage.getItem("ai_political");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPolitical(e.data); return; } else { sessionStorage.removeItem("ai_political"); } } catch {} }
    setAiPoliticalLoading(true);
    apiRequest("POST", "/api/ai/political-content", {}).then(r => r.json()).then(d => { setAiPolitical(d); sessionStorage.setItem("ai_political", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiPoliticalLoading(false));
  }, [showSensitivityAI]);
  useEffect(() => {
    if (!showSensitivityAI) return;
    const cached = sessionStorage.getItem("ai_religious");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiReligious(e.data); return; } else { sessionStorage.removeItem("ai_religious"); } } catch {} }
    setAiReligiousLoading(true);
    apiRequest("POST", "/api/ai/religious-sensitivity", {}).then(r => r.json()).then(d => { setAiReligious(d); sessionStorage.setItem("ai_religious", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiReligiousLoading(false));
  }, [showSensitivityAI]);
  useEffect(() => {
    if (!showSensitivityAI) return;
    const cached = sessionStorage.getItem("ai_cultural");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCulturalCS(e.data); return; } else { sessionStorage.removeItem("ai_cultural"); } } catch {} }
    setAiCulturalCSLoading(true);
    apiRequest("POST", "/api/ai/cultural-sensitivity", {}).then(r => r.json()).then(d => { setAiCulturalCS(d); sessionStorage.setItem("ai_cultural", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCulturalCSLoading(false));
  }, [showSensitivityAI]);
  useEffect(() => {
    if (!showSensitivityAI) return;
    const cached = sessionStorage.getItem("ai_body_image");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBodyImage(e.data); return; } else { sessionStorage.removeItem("ai_body_image"); } } catch {} }
    setAiBodyImageLoading(true);
    apiRequest("POST", "/api/ai/body-image", {}).then(r => r.json()).then(d => { setAiBodyImage(d); sessionStorage.setItem("ai_body_image", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiBodyImageLoading(false));
  }, [showSensitivityAI]);
  useEffect(() => {
    if (!showSensitivityAI) return;
    const cached = sessionStorage.getItem("ai_addiction");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAddiction(e.data); return; } else { sessionStorage.removeItem("ai_addiction"); } } catch {} }
    setAiAddictionLoading(true);
    apiRequest("POST", "/api/ai/addiction-content", {}).then(r => r.json()).then(d => { setAiAddiction(d); sessionStorage.setItem("ai_addiction", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiAddictionLoading(false));
  }, [showSensitivityAI]);
  useEffect(() => {
    if (!showSensitivityAI) return;
    const cached = sessionStorage.getItem("ai_fin_disclaim");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiFinDisclaim(e.data); return; } else { sessionStorage.removeItem("ai_fin_disclaim"); } } catch {} }
    setAiFinDisclaimLoading(true);
    apiRequest("POST", "/api/ai/financial-disclaimer", {}).then(r => r.json()).then(d => { setAiFinDisclaim(d); sessionStorage.setItem("ai_fin_disclaim", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiFinDisclaimLoading(false));
  }, [showSensitivityAI]);

  useEffect(() => {
    if (!showLegalProtAI) return;
    const cached = sessionStorage.getItem("ai_copyright_shield");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCopyrightShield(e.data); return; } else { sessionStorage.removeItem("ai_copyright_shield"); } } catch {} }
    setAiCopyrightShieldLoading(true);
    apiRequest("POST", "/api/ai/copyright-shield", {}).then(r => r.json()).then(d => { setAiCopyrightShield(d); sessionStorage.setItem("ai_copyright_shield", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiCopyrightShieldLoading(false));
  }, [showLegalProtAI]);
  useEffect(() => {
    if (!showLegalProtAI) return;
    const cached = sessionStorage.getItem("ai_contract_analyzer");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiContractAnalyzer(e.data); return; } else { sessionStorage.removeItem("ai_contract_analyzer"); } } catch {} }
    setAiContractAnalyzerLoading(true);
    apiRequest("POST", "/api/ai/contract-analyzer", {}).then(r => r.json()).then(d => { setAiContractAnalyzer(d); sessionStorage.setItem("ai_contract_analyzer", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiContractAnalyzerLoading(false));
  }, [showLegalProtAI]);
  useEffect(() => {
    if (!showLegalProtAI) return;
    const cached = sessionStorage.getItem("ai_fair_use_analyzer");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiFairUseAnalyzer(e.data); return; } else { sessionStorage.removeItem("ai_fair_use_analyzer"); } } catch {} }
    setAiFairUseAnalyzerLoading(true);
    apiRequest("POST", "/api/ai/fair-use-analyzer", {}).then(r => r.json()).then(d => { setAiFairUseAnalyzer(d); sessionStorage.setItem("ai_fair_use_analyzer", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiFairUseAnalyzerLoading(false));
  }, [showLegalProtAI]);
  useEffect(() => {
    if (!showLegalProtAI) return;
    const cached = sessionStorage.getItem("ai_dmca_defense");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDMCADefense(e.data); return; } else { sessionStorage.removeItem("ai_dmca_defense"); } } catch {} }
    setAiDMCADefenseLoading(true);
    apiRequest("POST", "/api/ai/dmca-defense-assistant", {}).then(r => r.json()).then(d => { setAiDMCADefense(d); sessionStorage.setItem("ai_dmca_defense", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiDMCADefenseLoading(false));
  }, [showLegalProtAI]);
  useEffect(() => {
    if (!showLegalProtAI) return;
    const cached = sessionStorage.getItem("ai_content_ins_advisor");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiContentInsAdvisor(e.data); return; } else { sessionStorage.removeItem("ai_content_ins_advisor"); } } catch {} }
    setAiContentInsAdvisorLoading(true);
    apiRequest("POST", "/api/ai/content-insurance-advisor", {}).then(r => r.json()).then(d => { setAiContentInsAdvisor(d); sessionStorage.setItem("ai_content_ins_advisor", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiContentInsAdvisorLoading(false));
  }, [showLegalProtAI]);

  const renderAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return <p className="text-xs text-muted-foreground italic">No results available</p>;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

  return (
    <div className="space-y-6">
      <h2 data-testid="text-legal-title" className="text-lg font-semibold">Legal & Formation</h2>

      <BusinessStructureSection />

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <Sparkles className="w-6 h-6 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm mb-1" data-testid="text-why-company-title">Why You Need a Business Set Up</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Making money from content means you're running a business, even if it doesn't feel like it yet.
                Without a proper structure, you're personally on the hook for everything -- taxes, lawsuits, debts, all of it.
                Setting up the right way protects your personal assets, saves you money on taxes, and makes you look professional to sponsors and brands.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="flex items-start gap-2 p-3 rounded-md bg-background/50">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium">Personal Protection</p>
                <p className="text-[11px] text-muted-foreground">Separates your personal stuff from your business. If something goes wrong, your house, car, and savings stay safe.</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-md bg-background/50">
              <DollarSign className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium">Tax Savings</p>
                <p className="text-[11px] text-muted-foreground">The right structure can save you thousands in taxes every year. Write off equipment, internet, games -- all legally.</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-md bg-background/50">
              <FileCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium">Look Professional</p>
                <p className="text-[11px] text-muted-foreground">Brands and sponsors take you seriously when you have a real business. Opens doors to bigger deals and partnerships.</p>
              </div>
            </div>
          </div>

          <div className="border-t border-border/50 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <p className="text-sm font-medium">AI Business Structure Advisor</p>
              <Badge variant="outline" className="text-[10px]">Personalized</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Tell us where you live and our AI will recommend the best business structure, tax strategy, and formation steps for your specific location.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  data-testid="input-location"
                  placeholder="City, State or Country (e.g. Austin, Texas)"
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") fetchStructureAdvice(locationInput); }}
                  className="text-sm"
                />
              </div>
              <Button
                data-testid="button-get-advice"
                onClick={() => fetchStructureAdvice(locationInput)}
                disabled={!locationInput.trim() || aiStructureLoading}
              >
                {aiStructureLoading ? "Analyzing..." : "Get My Plan"}
              </Button>
            </div>
          </div>

          {aiStructureLoading && (
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}

          {aiStructure && !aiStructureLoading && (
            <div className="mt-4 space-y-3" data-testid="section-ai-structure-advice">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  <MapPin className="w-3 h-3 mr-1" />
                  {location}
                </Badge>
                <Badge variant="outline" className="text-[10px]">AI-Generated</Badge>
              </div>
              <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                {aiStructure.recommendation && (
                  <div className="p-3 rounded-md bg-background/50">
                    <p className="font-medium text-foreground text-sm mb-1">Recommended Structure</p>
                    <p>{typeof aiStructure.recommendation === "string" ? aiStructure.recommendation : JSON.stringify(aiStructure.recommendation)}</p>
                  </div>
                )}
                {aiStructure.entityType && (
                  <div className="p-3 rounded-md bg-background/50">
                    <p className="font-medium text-foreground text-sm mb-1">Best Entity Type</p>
                    <p>{typeof aiStructure.entityType === "string" ? aiStructure.entityType : JSON.stringify(aiStructure.entityType)}</p>
                  </div>
                )}
                {(aiStructure.taxStrategy || aiStructure.taxBenefits) && (
                  <div className="p-3 rounded-md bg-background/50">
                    <p className="font-medium text-foreground text-sm mb-1">Tax Strategy</p>
                    <p>{typeof (aiStructure.taxStrategy || aiStructure.taxBenefits) === "string" ? (aiStructure.taxStrategy || aiStructure.taxBenefits) as string : JSON.stringify(aiStructure.taxStrategy || aiStructure.taxBenefits)}</p>
                  </div>
                )}
                {(aiStructure.steps || aiStructure.formationSteps) && Array.isArray(aiStructure.steps || aiStructure.formationSteps) && (
                  <div className="p-3 rounded-md bg-background/50">
                    <p className="font-medium text-foreground text-sm mb-1">Steps to Get Started</p>
                    <ol className="list-decimal list-inside space-y-1">
                      {((aiStructure.steps || aiStructure.formationSteps) as any[]).map((s: any, i: number) => (
                        <li key={i}>{typeof s === "string" ? s : s.title || s.step || s.description || s.name || JSON.stringify(s)}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {(aiStructure.recommendations || aiStructure.tips || aiStructure.entities || aiStructure.results) && Array.isArray(aiStructure.recommendations || aiStructure.tips || aiStructure.entities || aiStructure.results) && (
                  <div className="p-3 rounded-md bg-background/50">
                    <p className="font-medium text-foreground text-sm mb-1">Key Recommendations</p>
                    <ul className="list-disc list-inside space-y-1">
                      {((aiStructure.recommendations || aiStructure.tips || aiStructure.entities || aiStructure.results) as any[]).slice(0, 8).map((item: any, i: number) => (
                        <li key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || JSON.stringify(item)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {aiStructure.estimatedCost && (
                  <div className="p-3 rounded-md bg-background/50">
                    <p className="font-medium text-foreground text-sm mb-1">Estimated Cost</p>
                    <p>{typeof aiStructure.estimatedCost === "string" ? aiStructure.estimatedCost : JSON.stringify(aiStructure.estimatedCost)}</p>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/60 italic">This is AI-generated guidance, not legal advice. Consult a professional for your specific situation.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={completionPct === 100 ? "border-emerald-500/30 bg-emerald-500/5" : completionPct > 50 ? "border-amber-500/30 bg-amber-500/5" : ""}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
            <div>
              <p className="text-sm font-medium" data-testid="text-formation-status">
                {completionPct === 100 ? "Formation Complete" : `Formation Progress: ${completionPct}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                {completedSteps.length} of {FORMATION_STEPS.length} steps done
              </p>
            </div>
            {entityType && <Badge variant="secondary" className="text-xs">{entityTypeLabels[entityType] || entityType}</Badge>}
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completionPct}%` }} data-testid="bar-formation-progress" />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {FORMATION_STEPS.map((step) => {
          const done = completedSteps.includes(step.key);
          return (
            <Card key={step.key} className={`cursor-pointer hover-elevate ${done ? "border-emerald-500/20" : ""}`} onClick={() => toggleStep(step.key)} data-testid={`card-formation-step-${step.key}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${done ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground/30"}`}>
                    {done && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{step.label}</p>
                    <p className="text-xs text-muted-foreground">{step.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {upcomingTax && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <CalendarDays className="w-4 h-4 text-amber-500" />
              <p className="text-sm font-medium">Upcoming Tax Payment</p>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="text-upcoming-tax">
              {upcomingTax.quarter} {upcomingTax.year} — Est. ${(upcomingTax.estimatedTax || 0).toLocaleString()} due {upcomingTax.dueDate ? new Date(upcomingTax.dueDate).toLocaleDateString() : "TBD"}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">Compliance Reminders</p>
          </div>
          <div className="space-y-2">
            {[
              { label: "Annual Report Filing", status: completedSteps.includes("state") ? "done" : "pending" },
              { label: "Quarterly Tax Estimates", status: upcomingTax ? "upcoming" : "done" },
              { label: "Business License Renewal", status: completedSteps.includes("ein") ? "done" : "pending" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`compliance-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
                <span className="text-xs">{item.label}</span>
                <Badge variant="secondary" className={`text-xs no-default-hover-elevate no-default-active-elevate ${item.status === "done" ? "bg-emerald-500/10 text-emerald-500" : item.status === "upcoming" ? "bg-amber-500/10 text-amber-500" : "bg-muted-foreground/10 text-muted-foreground"}`}>
                  {item.status === "done" ? "Complete" : item.status === "upcoming" ? "Due Soon" : "Pending"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <CollapsibleToolbox title="AI Legal Tools" toolCount={25} open={aiToolsOpen} onOpenChange={setAiToolsOpen}>
      <div className="space-y-3">
      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowLegalAI(!showLegalAI)}
          data-testid="button-toggle-legal-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Legal & Compliance Suite</span>
          <Badge variant="outline" className="text-[10px]">15 tools</Badge>
          {showLegalAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showLegalAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiCopyrightLoading || aiCopyright) && (
              <Card data-testid="card-ai-copyright">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Copyright Check</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCopyrightLoading ? <Skeleton className="h-24 w-full" /> : aiCopyright && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCopyright.issues || aiCopyright.recommendations || aiCopyright.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFairUseLoading || aiFairUse) && (
              <Card data-testid="card-ai-fair-use">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Fair Use</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFairUseLoading ? <Skeleton className="h-24 w-full" /> : aiFairUse && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFairUse.analysis || aiFairUse.recommendations || aiFairUse.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMusicLicenseLoading || aiMusicLicense) && (
              <Card data-testid="card-ai-music-license">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Music License</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMusicLicenseLoading ? <Skeleton className="h-24 w-full" /> : aiMusicLicense && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMusicLicense.licenses || aiMusicLicense.recommendations || aiMusicLicense.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPrivacyPolicyLoading || aiPrivacyPolicy) && (
              <Card data-testid="card-ai-privacy-policy">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Privacy Policy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPrivacyPolicyLoading ? <Skeleton className="h-24 w-full" /> : aiPrivacyPolicy && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPrivacyPolicy.sections || aiPrivacyPolicy.recommendations || aiPrivacyPolicy.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiToSLoading || aiToS) && (
              <Card data-testid="card-ai-tos">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Terms of Service</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiToSLoading ? <Skeleton className="h-24 w-full" /> : aiToS && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiToS.clauses || aiToS.recommendations || aiToS.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFTCLoading || aiFTC) && (
              <Card data-testid="card-ai-ftc">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI FTC Compliance</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFTCLoading ? <Skeleton className="h-24 w-full" /> : aiFTC && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFTC.guidelines || aiFTC.recommendations || aiFTC.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCOPPALoading || aiCOPPA) && (
              <Card data-testid="card-ai-coppa">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI COPPA</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCOPPALoading ? <Skeleton className="h-24 w-full" /> : aiCOPPA && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCOPPA.requirements || aiCOPPA.recommendations || aiCOPPA.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiGDPRLoading || aiGDPR) && (
              <Card data-testid="card-ai-gdpr">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI GDPR</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiGDPRLoading ? <Skeleton className="h-24 w-full" /> : aiGDPR && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiGDPR.compliance || aiGDPR.recommendations || aiGDPR.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContentIDLoading || aiContentID) && (
              <Card data-testid="card-ai-content-id">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Content ID</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContentIDLoading ? <Skeleton className="h-24 w-full" /> : aiContentID && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContentID.claims || aiContentID.recommendations || aiContentID.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDisputeLoading || aiDispute) && (
              <Card data-testid="card-ai-dispute">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Dispute Resolution</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDisputeLoading ? <Skeleton className="h-24 w-full" /> : aiDispute && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDispute.disputes || aiDispute.recommendations || aiDispute.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTrademarkLoading || aiTrademark) && (
              <Card data-testid="card-ai-trademark">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Trademark</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTrademarkLoading ? <Skeleton className="h-24 w-full" /> : aiTrademark && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTrademark.marks || aiTrademark.recommendations || aiTrademark.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContractTemplLoading || aiContractTempl) && (
              <Card data-testid="card-ai-contract-templ">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Contract Template</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContractTemplLoading ? <Skeleton className="h-24 w-full" /> : aiContractTempl && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContractTempl.templates || aiContractTempl.recommendations || aiContractTempl.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInsuranceLoading || aiInsurance) && (
              <Card data-testid="card-ai-insurance">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Insurance</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInsuranceLoading ? <Skeleton className="h-24 w-full" /> : aiInsurance && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiInsurance.policies || aiInsurance.recommendations || aiInsurance.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBizEntityLoading || aiBizEntity) && (
              <Card data-testid="card-ai-biz-entity">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Business Entity</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBizEntityLoading ? <Skeleton className="h-24 w-full" /> : aiBizEntity && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBizEntity.entities || aiBizEntity.recommendations || aiBizEntity.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiIPProtectLoading || aiIPProtect) && (
              <Card data-testid="card-ai-ip-protect">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI IP Protection</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiIPProtectLoading ? <Skeleton className="h-24 w-full" /> : aiIPProtect && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiIPProtect.protections || aiIPProtect.recommendations || aiIPProtect.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowSensitivityAI(!showSensitivityAI)}
          data-testid="button-toggle-sensitivity-ai"
        >
          <Sparkles className="h-4 w-4 text-yellow-400" />
          <span className="text-sm font-semibold">AI Content Sensitivity Suite</span>
          <Badge variant="outline" className="text-[10px]">8 tools</Badge>
          {showSensitivityAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showSensitivityAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiDiversityCSLoading || aiDiversityCS) && (
              <Card data-testid="card-ai-diversity">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Diversity</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDiversityCSLoading ? <Skeleton className="h-24 w-full" /> : aiDiversityCS && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDiversityCS.strategies || aiDiversityCS.tips || aiDiversityCS.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMHContentLoading || aiMHContent) && (
              <Card data-testid="card-ai-mh-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Mental Health Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMHContentLoading ? <Skeleton className="h-24 w-full" /> : aiMHContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMHContent.strategies || aiMHContent.tips || aiMHContent.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPoliticalLoading || aiPolitical) && (
              <Card data-testid="card-ai-political">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Political Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPoliticalLoading ? <Skeleton className="h-24 w-full" /> : aiPolitical && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPolitical.strategies || aiPolitical.tips || aiPolitical.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiReligiousLoading || aiReligious) && (
              <Card data-testid="card-ai-religious">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Religious Sensitivity</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiReligiousLoading ? <Skeleton className="h-24 w-full" /> : aiReligious && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiReligious.strategies || aiReligious.tips || aiReligious.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCulturalCSLoading || aiCulturalCS) && (
              <Card data-testid="card-ai-cultural">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Cultural Sensitivity</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCulturalCSLoading ? <Skeleton className="h-24 w-full" /> : aiCulturalCS && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCulturalCS.strategies || aiCulturalCS.tips || aiCulturalCS.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBodyImageLoading || aiBodyImage) && (
              <Card data-testid="card-ai-body-image">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Body Image</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBodyImageLoading ? <Skeleton className="h-24 w-full" /> : aiBodyImage && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBodyImage.strategies || aiBodyImage.tips || aiBodyImage.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAddictionLoading || aiAddiction) && (
              <Card data-testid="card-ai-addiction">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Addiction Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAddictionLoading ? <Skeleton className="h-24 w-full" /> : aiAddiction && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAddiction.strategies || aiAddiction.tips || aiAddiction.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFinDisclaimLoading || aiFinDisclaim) && (
              <Card data-testid="card-ai-fin-disclaim">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-yellow-400" />
                    <h3 className="font-semibold text-sm">AI Financial Disclaimer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFinDisclaimLoading ? <Skeleton className="h-24 w-full" /> : aiFinDisclaim && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFinDisclaim.strategies || aiFinDisclaim.tips || aiFinDisclaim.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowLegalProtAI(!showLegalProtAI)}
          data-testid="button-toggle-legal-prot-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Legal Protection Suite</span>
          <Badge variant="outline" className="text-[10px]">5 tools</Badge>
          {showLegalProtAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showLegalProtAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiCopyrightShieldLoading || aiCopyrightShield) && (
              <Card data-testid="card-ai-copyright-shield">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Copyright Shield</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCopyrightShieldLoading ? <Skeleton className="h-24 w-full" /> : aiCopyrightShield && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCopyrightShield.scans || aiCopyrightShield.strikes || aiCopyrightShield.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContractAnalyzerLoading || aiContractAnalyzer) && (
              <Card data-testid="card-ai-contract-analyzer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Contract Analyzer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContractAnalyzerLoading ? <Skeleton className="h-24 w-full" /> : aiContractAnalyzer && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContractAnalyzer.clauses || aiContractAnalyzer.reviews || aiContractAnalyzer.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFairUseAnalyzerLoading || aiFairUseAnalyzer) && (
              <Card data-testid="card-ai-fair-use-analyzer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Fair Use Analyzer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFairUseAnalyzerLoading ? <Skeleton className="h-24 w-full" /> : aiFairUseAnalyzer && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiFairUseAnalyzer.evaluations || aiFairUseAnalyzer.factors || aiFairUseAnalyzer.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDMCADefenseLoading || aiDMCADefense) && (
              <Card data-testid="card-ai-dmca-defense">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI DMCA Defense Assistant</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDMCADefenseLoading ? <Skeleton className="h-24 w-full" /> : aiDMCADefense && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDMCADefense.responses || aiDMCADefense.claims || aiDMCADefense.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContentInsAdvisorLoading || aiContentInsAdvisor) && (
              <Card data-testid="card-ai-content-ins-advisor">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Content Insurance Advisor</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContentInsAdvisorLoading ? <Skeleton className="h-24 w-full" /> : aiContentInsAdvisor && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiContentInsAdvisor.policies || aiContentInsAdvisor.coverage || aiContentInsAdvisor.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
      </div>
      </CollapsibleToolbox>
    </div>
  );
}

export default LegalTab;
