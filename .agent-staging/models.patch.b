+            "updated_at": self.stripe_connect_updated_at.isoformat()
+            if self.stripe_connect_updated_at
+            else None,
+        }
+
     def approved_photos(self):
         return [photo for photo in self.photos if photo.status == "approved"]
 
@@ -238,6 +300,14 @@
             # A buyer-visible trust signal. It says the person behind the shop
             # passed an ID check, and nothing about who they are.
             "identity_verified": self.identity_verified,
+            "slug": self.slug,
+            "storefront_path": self.storefront_path,
+            "tagline": self.tagline,
+            "logo_url": self.logo_url,
+            "theme": self.theme_dict(),
+            # Buyer-safe readiness flag: whether a card order can be placed.
+            # The account id and onboarding detail stay owner/admin only.
+            "accepts_card_payments": self.accepts_connect_payments,
         }
         if include_photos:
             data["photos"] = [photo.to_dict() for photo in self.approved_photos()]
@@ -245,6 +315,8 @@
             data["contact_email"] = self.contact_email
             data["profile_photo_status"] = self.profile_photo_status
             data["identity_status"] = self.identity_status
+            # Owner/admin only: buyers do not need to see payout plumbing.
+            data["connect"] = self.connect_dict()
         return data
 
 
@@ -393,6 +465,10 @@
     pickup_code = db.Column(db.String(32))
     stripe_checkout_session_id = db.Column(db.String(255))
     stripe_payment_intent_id = db.Column(db.String(255))
+    # Set when checkout was a Connect destination charge: the shop's acct_...
+    # at the time of the order. NULL means the platform collected the money
+    # and still owes `seller_payout_cents` by hand (the pre-Connect model).
+    stripe_destination_account_id = db.Column(db.String(255))
     paid_at = db.Column(db.DateTime)
     inventory_released_at = db.Column(db.DateTime)
 
@@ -410,6 +486,11 @@
         return max(0, (self.total_cents or 0) - (self.platform_fee_cents or 0))
 
     @property
+    def payout_method(self):
+        """"connect" when Stripe paid the shop directly, else "manual"."""
+        return "connect" if self.stripe_destination_account_id else "manual"
+
+    @property
     def is_fulfillable(self):
         return self.payment_status in FULFILLABLE_PAYMENT_STATUSES
 
@@ -424,6 +505,7 @@
             "platform_fee_cents": self.platform_fee_cents,
             "seller_payout_cents": self.seller_payout_cents,
             "currency": self.currency,
+            "payout_method": self.payout_method,
             "paid_at": self.paid_at.isoformat() if self.paid_at else None,
             "created_at": self.created_at.isoformat() if self.created_at else None,
             "items": [item.to_dict() for item in self.items],
