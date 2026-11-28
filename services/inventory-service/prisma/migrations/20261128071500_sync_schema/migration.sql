ALTER TABLE "inventory"."goods_issue_lines" DROP CONSTRAINT "goods_issue_lines_issue_id_fkey";
ALTER TABLE "inventory"."goods_receipt_lines" DROP CONSTRAINT "goods_receipt_lines_receipt_id_fkey";
ALTER TABLE "inventory"."stock_take_lines" DROP CONSTRAINT "stock_take_lines_take_id_fkey";
ALTER TABLE "inventory"."transfer_lines" DROP CONSTRAINT "transfer_lines_transfer_id_fkey";
ALTER TABLE "inventory"."goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "inventory"."goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."goods_issue_lines" ADD CONSTRAINT "goods_issue_lines_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "inventory"."goods_issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."transfer_lines" ADD CONSTRAINT "transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "inventory"."transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."stock_take_lines" ADD CONSTRAINT "stock_take_lines_take_id_fkey" FOREIGN KEY ("take_id") REFERENCES "inventory"."stock_takes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
