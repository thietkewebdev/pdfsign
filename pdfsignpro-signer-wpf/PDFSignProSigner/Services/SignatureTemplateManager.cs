using System.Collections.ObjectModel;
using PDFSignProSigner.Models;

namespace PDFSignProSigner.Services;

public class SignatureTemplateManager
{
    private readonly AppSettings _settings;

    public ObservableCollection<SignatureTemplate> Templates { get; } = new();

    public SignatureTemplate? SelectedTemplate { get; private set; }

    public SignatureTemplateManager()
    {
        _settings = AppSettings.Load();
        LoadBuiltInTemplates();
        RestoreSelected();
    }

    private void LoadBuiltInTemplates()
    {
        Templates.Clear();
        Templates.Add(new SignatureTemplate(
            Id: "classic",
            DisplayName: "Classic",
            FontFamily: "Segoe UI",
            FontSize: 10,
            Color: "#374151",
            BorderStyle: SignatureTemplate.BorderNone,
            Background: SignatureTemplate.BgTransparent,
            Layout: SignatureTemplate.LayoutStack,
            ShowDate: true,
            DateFormat: "dd/MM/yyyy HH:mm",
            StampText: null
        ));
        Templates.Add(new SignatureTemplate(
            Id: "modern",
            DisplayName: "Modern",
            FontFamily: "Segoe UI",
            FontSize: 9,
            Color: "#1F2937",
            BorderStyle: SignatureTemplate.BorderNone,
            Background: SignatureTemplate.BgSoft,
            Layout: SignatureTemplate.LayoutStack,
            ShowDate: true,
            DateFormat: "dd/MM/yyyy",
            StampText: null
        ));
        Templates.Add(new SignatureTemplate(
            Id: "minimal",
            DisplayName: "Minimal",
            FontFamily: "Segoe UI",
            FontSize: 11,
            Color: "#111827",
            BorderStyle: SignatureTemplate.BorderNone,
            Background: SignatureTemplate.BgTransparent,
            Layout: SignatureTemplate.LayoutCenter,
            ShowDate: false,
            DateFormat: "",
            StampText: null
        ));
        Templates.Add(new SignatureTemplate(
            Id: "stamp",
            DisplayName: "Stamp",
            FontFamily: "Segoe UI",
            FontSize: 10,
            Color: "#374151",
            BorderStyle: SignatureTemplate.BorderSolid,
            Background: SignatureTemplate.BgWhite,
            Layout: SignatureTemplate.LayoutStack,
            ShowDate: true,
            DateFormat: "dd/MM/yyyy",
            StampText: "Đã ký số"
        ));
    }

    private void RestoreSelected()
    {
        var id = _settings.SelectedTemplateId;
        if (string.IsNullOrEmpty(id)) id = "classic";

        var template = Templates.FirstOrDefault(t => t.Id == id);
        SelectedTemplate = template ?? Templates.FirstOrDefault();
    }

    public void SelectTemplate(SignatureTemplate template)
    {
        SelectedTemplate = template;
        _settings.SelectedTemplateId = template.Id;
        _settings.Save();
    }

    public void SelectTemplateById(string id)
    {
        var template = Templates.FirstOrDefault(t => t.Id == id);
        if (template != null)
            SelectTemplate(template);
    }
}
