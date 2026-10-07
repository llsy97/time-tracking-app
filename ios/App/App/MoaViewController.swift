import Capacitor
import UIKit
import WebKit

class MoaViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        guard let webView = webView else { return }
        bridge?.registerPluginInstance(MoaTrackerPlugin())
        bridge?.registerPluginInstance(MoaGooglePlugin())
        let container = UIView()
        container.backgroundColor = UIColor(red: 244/255, green: 241/255, blue: 234/255, alpha: 1)
        container.clipsToBounds = true
        view = container
        container.addSubview(webView)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        let bottom = webView.bottomAnchor.constraint(equalTo: container.safeAreaLayoutGuide.bottomAnchor)
        bottom.priority = .defaultHigh
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: container.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.safeAreaLayoutGuide.trailingAnchor),
            webView.bottomAnchor.constraint(lessThanOrEqualTo: container.safeAreaLayoutGuide.bottomAnchor),
            webView.bottomAnchor.constraint(lessThanOrEqualTo: container.keyboardLayoutGuide.topAnchor), bottom
        ])
        webView.configuration.userContentController.addUserScript(WKUserScript(source: "document.documentElement.classList.add('native-app');", injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }
    func applyAppearance(dark: Bool) {
        view.backgroundColor = dark ? UIColor(red: 14/255, green: 14/255, blue: 12/255, alpha: 1) : UIColor(red: 244/255, green: 241/255, blue: 234/255, alpha: 1)
        webView?.backgroundColor = view.backgroundColor
        setStatusBarStyle(dark ? .lightContent : .darkContent)
    }
}
